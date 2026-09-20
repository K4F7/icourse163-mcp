import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  COURSE_LIST_RPC_URL,
  TERM_RPC_URL,
  WARMUP_URL,
} from "../src/auth";
import {
  COURSE_PANEL_PAGE_SIZE,
  learnReferer,
  listTodos,
  parseCoursePanelItems,
  parseMocTermDto,
  todosFromMocTerm,
  type Icourse163Http,
  type Icourse163HttpRequest,
  type ListTodosPorts,
} from "../src/list-todos";
import { TODO_KIND_EXAM, TODO_KIND_QUIZ } from "../src/todo-open";
import {
  CLOSED_ONLY_MOC_TERM_DTO,
  EMPTY_COURSE_PANEL_BODY,
  EMPTY_MOC_TERM_BODY,
  FUTURE_ISO,
  MIXED_MOC_TERM_DTO,
  MOOC_COURSE,
  NOW_ISO,
  SPOC_COURSE,
  coursePanelBody,
  mocTermBody,
} from "./fixtures";

const SESSION = "NTESSTUDYSI=test-session";
const NOW = new Date(NOW_ISO);

const MOOC_PANEL = {
  name: "大学物理",
  course_id: "1001",
  term_id: "2001",
  school_short_name: "SJTU",
  type: "mooc" as const,
};

type RecordedCall = Icourse163HttpRequest;

function portsWith(
  getCookie: () => Promise<string | null>,
  http: Icourse163Http,
): ListTodosPorts {
  return { credentials: { getCookie }, http };
}

function recordingHttp(
  handler: (input: Icourse163HttpRequest) => {
    statusCode: number;
    body: string;
    cookie?: string;
  },
): { calls: RecordedCall[]; http: Icourse163Http } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    http: {
      async request(input) {
        calls.push(input);
        const result = handler(input);
        return {
          statusCode: result.statusCode,
          url: input.url,
          body: result.body,
          cookie: result.cookie ?? input.cookie,
        };
      },
    },
  };
}

function warmupOk(input: Icourse163HttpRequest): {
  statusCode: number;
  body: string;
  cookie: string;
} | null {
  if ((input.method ?? "GET") === "GET" && input.url === WARMUP_URL) {
    return {
      statusCode: 200,
      body: "<html>ok</html>",
      cookie: `${input.cookie}; STUDY_INFO=ok`,
    };
  }
  return null;
}

describe("parseCoursePanelItems", () => {
  test("maps name, id, termPanel.id, schoolPanel.shortName", () => {
    const items = parseCoursePanelItems(coursePanelBody([MOOC_COURSE, SPOC_COURSE]));
    assert.deepEqual(items, [
      MOOC_PANEL,
      {
        name: "SPOC实验课",
        course_id: "1002",
        term_id: "2002",
        school_short_name: "SJTU",
        type: "mooc",
      },
    ]);
  });

  test("empty result list is [] not null", () => {
    assert.deepEqual(parseCoursePanelItems(EMPTY_COURSE_PANEL_BODY), []);
  });

  test("non-zero code is parse failure", () => {
    assert.equal(parseCoursePanelItems(JSON.stringify({ code: 11, result: null })), null);
  });
});

describe("todosFromMocTerm", () => {
  test("keeps open quiz, legacy contentType=5 unit, and future exam; drops submitted and past", () => {
    const moc = parseMocTermDto(mocTermBody(MIXED_MOC_TERM_DTO));
    assert.ok(moc != null);
    const todos = todosFromMocTerm(moc, MOOC_PANEL, NOW);
    const titles = todos.map((todo) => todo.title);
    assert.deepEqual(titles.sort(), ["第一章单元测验", "第一章作业", "旧版单元测验", "进行中的考试"].sort());
    assert.equal(
      todos.some((todo) => todo.title === "已交的测验" || todo.title === "期末考试"),
      false,
    );
    const quiz = todos.find((todo) => todo.title === "第一章单元测验");
    assert.ok(quiz != null);
    assert.equal(quiz.kind, TODO_KIND_QUIZ);
    assert.equal(quiz.due_at, FUTURE_ISO);
    assert.equal(quiz.course_title, "大学物理");
    assert.equal(quiz.id, "1001:2001:quiz:301");
    const exam = todos.find((todo) => todo.title === "进行中的考试");
    assert.ok(exam != null);
    assert.equal(exam.kind, TODO_KIND_EXAM);
    const unit = todos.find((todo) => todo.title === "旧版单元测验");
    assert.ok(unit != null);
    assert.equal(unit.id, "1001:2001:unit:401");
    const homework = todos.find((todo) => todo.title === "第一章作业");
    assert.ok(homework);
    assert.equal(homework.id, "1001:2001:homework:701");
    assert.equal(homework.kind, "作业");
  });

  test("accepts result without mocTermDto wrapper", () => {
    const moc = parseMocTermDto(mocTermBody(MIXED_MOC_TERM_DTO, false));
    assert.ok(moc != null);
    assert.ok(todosFromMocTerm(moc, MOOC_PANEL, NOW).length > 0);
  });
});

describe("listTodos", () => {
  test("null credentials is auth_expired with isError, never ok+empty", async () => {
    const { calls, http } = recordingHttp(() => {
      throw new Error("http should not run");
    });
    const result = await listTodos(portsWith(async () => null, http), NOW);
    assert.equal(result.status, "auth_expired");
    assert.equal(result.isError, true);
    assert.deepEqual(result.todos, []);
    assert.notEqual(result.status, "ok");
    assert.deepEqual(calls, []);
    assert.equal("cookie" in result, false);
    assert.equal(JSON.stringify(result).includes("test-session"), false);
  });

  test("missing ports is auth_expired", async () => {
    const result = await listTodos(undefined, NOW);
    assert.equal(result.status, "auth_expired");
    assert.equal(result.isError, true);
    assert.deepEqual(result.todos, []);
  });

  test("failed probe is auth_expired, never ok", async () => {
    const { http } = recordingHttp((input) => {
      if (input.url === WARMUP_URL) {
        return { statusCode: 200, body: "<html>home</html>" };
      }
      return { statusCode: 200, body: JSON.stringify({ code: 11, result: null }) };
    });
    const result = await listTodos(portsWith(async () => SESSION, http), NOW);
    assert.equal(result.status, "auth_expired");
    assert.equal(result.isError, true);
    assert.deepEqual(result.todos, []);
    assert.notEqual(result.status, "ok");
  });

  test("empty course panels is ok with todos []", async () => {
    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed != null) {
        return warmed;
      }
      if (input.url.startsWith(COURSE_LIST_RPC_URL)) {
        return { statusCode: 200, body: EMPTY_COURSE_PANEL_BODY };
      }
      throw new Error(`unexpected url ${input.url}`);
    });
    const result = await listTodos(portsWith(async () => SESSION, http), NOW);
    assert.equal(result.status, "ok");
    assert.equal(result.isError, false);
    assert.deepEqual(result.todos, []);
    const types = calls
      .filter((call) => call.url.startsWith(COURSE_LIST_RPC_URL) && call.form?.psize === "20")
      .map((call) => call.form?.courseType);
    assert.deepEqual(types, ["1", "2"]);
    assert.equal(JSON.stringify(result).includes("NTESSTUDYSI"), false);
    assert.equal(JSON.stringify(result).includes("test-session"), false);
  });

  test("courses with only closed items is ok+empty", async () => {
    const { http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed != null) {
        return warmed;
      }
      if (input.url.startsWith(COURSE_LIST_RPC_URL)) {
        const type = input.form?.courseType;
        const body =
          type === "1" ? coursePanelBody([MOOC_COURSE]) : EMPTY_COURSE_PANEL_BODY;
        return { statusCode: 200, body };
      }
      if (input.url.startsWith(TERM_RPC_URL)) {
        return { statusCode: 200, body: mocTermBody(CLOSED_ONLY_MOC_TERM_DTO) };
      }
      throw new Error(`unexpected url ${input.url}`);
    });
    const result = await listTodos(portsWith(async () => SESSION, http), NOW);
    assert.equal(result.status, "ok");
    assert.equal(result.isError, false);
    assert.deepEqual(result.todos, []);
  });

  test("returns open quiz/unit/exam from MOOC+SPOC and sends learn Referer", async () => {
    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed != null) {
        return warmed;
      }
      if (input.url.startsWith(COURSE_LIST_RPC_URL)) {
        const type = input.form?.courseType;
        if (type === "1") {
          return { statusCode: 200, body: coursePanelBody([MOOC_COURSE]) };
        }
        return { statusCode: 200, body: coursePanelBody([SPOC_COURSE]) };
      }
      if (input.url.startsWith(TERM_RPC_URL)) {
        const termId = input.form?.termId;
        if (termId === "2001") {
          return { statusCode: 200, body: mocTermBody(MIXED_MOC_TERM_DTO) };
        }
        return { statusCode: 200, body: EMPTY_MOC_TERM_BODY };
      }
      throw new Error(`unexpected url ${input.url}`);
    });

    const result = await listTodos(portsWith(async () => SESSION, http), NOW);
    assert.equal(result.status, "ok");
    assert.equal(result.isError, false);
    assert.equal(result.todos.length, 4);
    assert.deepEqual(
      result.todos.map((todo) => todo.title).sort(),
      ["第一章单元测验", "第一章作业", "旧版单元测验", "进行中的考试"].sort(),
    );
    const termCalls = calls.filter((call) => call.url.startsWith(TERM_RPC_URL));
    assert.equal(termCalls.length, 2);
    const moocTerm = termCalls.find((call) => call.form?.termId === "2001");
    assert.ok(moocTerm != null);
    assert.equal(moocTerm.headers?.referer, learnReferer(MOOC_PANEL));
    assert.equal(
      moocTerm.headers?.referer,
      "https://www.icourse163.org/learn/SJTU-1001?tid=2001",
    );
  });

  test("paginates course panel until a short page for both course types", async () => {
    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed != null) {
        return warmed;
      }
      if (input.url.startsWith(COURSE_LIST_RPC_URL)) {
        const page = Number(input.form?.p ?? "0");
        const type = input.form?.courseType;
        if (type === "1" && page === 1) {
          return {
            statusCode: 200,
            body: coursePanelBody(
              Array.from({ length: COURSE_PANEL_PAGE_SIZE }, (_, i) => ({
                id: 3000 + i,
                name: `MOOC ${i}`,
                termPanel: { id: 4000 + i },
                schoolPanel: { shortName: "SJTU" },
              })),
            ),
          };
        }
        if (type === "1" && page === 2) {
          return {
            statusCode: 200,
            body: coursePanelBody([
              {
                id: 3999,
                name: "MOOC tail",
                termPanel: { id: 4999 },
                schoolPanel: { shortName: "SJTU" },
              },
            ]),
          };
        }
        if (type === "2" && page === 1) {
          return { statusCode: 200, body: coursePanelBody([SPOC_COURSE]) };
        }
        return { statusCode: 200, body: EMPTY_COURSE_PANEL_BODY };
      }
      if (input.url.startsWith(TERM_RPC_URL)) {
        return { statusCode: 200, body: EMPTY_MOC_TERM_BODY };
      }
      throw new Error(`unexpected url ${input.url}`);
    });

    const result = await listTodos(portsWith(async () => SESSION, http), NOW);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.todos, []);
    const listCalls = calls.filter(
      (call) => call.url.startsWith(COURSE_LIST_RPC_URL) && call.form?.psize === "20",
    );
    assert.deepEqual(
      listCalls.map((call) => `${call.form?.courseType}:${call.form?.p}`),
      ["1:1", "1:2", "2:1"],
    );
  });
});
