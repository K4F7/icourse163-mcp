import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { WARMUP_URL } from "../src/auth";
import {
  HOMEWORK_PAPER_RPC_URL,
  QUIZ_PAPER_RPC_URL,
  SUBMIT_ANSWERS_RPC_URL,
  getHomework,
  parsePaperQuestions,
  parseTodoId,
  saveHomeworkAnswers,
  stripHtml,
  submitHomework,
} from "../src/homework";
import type {
  Icourse163Http,
  Icourse163HttpRequest,
  Icourse163Ports,
} from "../src/ports";

const SESSION = "NTESSTUDYSI=test-session";
const TODO_QUIZ = "1001:2001:quiz:301";
const TODO_EXAM = "1001:2001:exam:502";

const SAMPLE_PAPER = {
  aid: 90001,
  tid: 301,
  tname: "第一章单元测验",
  objectiveQList: [
    {
      id: 11,
      type: 1,
      title: "<p>1+1=?</p>",
      optionDtos: [
        { id: 101, content: "<p>A. 1</p>" },
        { id: 102, content: "<p>B. 2</p>" },
      ],
    },
    {
      id: 12,
      type: 2,
      title: "多选",
      optionDtos: [
        { id: 201, content: "A" },
        { id: 202, content: "B" },
      ],
    },
  ],
  subjectiveQList: [
    {
      id: 21,
      type: 4,
      title: "简述牛顿定律",
      answer: "",
    },
  ],
};

function paperBody(paper: unknown = SAMPLE_PAPER): string {
  return JSON.stringify({ code: 0, result: paper });
}

function portsWith(
  getCookie: () => Promise<string | null>,
  http: Icourse163Http,
): Icourse163Ports {
  return { credentials: { getCookie }, http };
}

function recordingHttp(
  handler: (input: Icourse163HttpRequest) => {
    statusCode: number;
    body: string;
    cookie?: string;
  },
): { calls: Icourse163HttpRequest[]; http: Icourse163Http } {
  const calls: Icourse163HttpRequest[] = [];
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

describe("parseTodoId / stripHtml / parsePaperQuestions", () => {
  test("parses list_todos compound id", () => {
    assert.deepEqual(parseTodoId(TODO_QUIZ), {
      course_id: "1001",
      term_id: "2001",
      source: "quiz",
      content_id: "301",
    });
    assert.equal(parseTodoId("bad"), null);
  });

  test("strips html for stem text", () => {
    assert.equal(stripHtml("<p>1&nbsp;+&nbsp;1</p>"), "1 + 1");
  });

  test("parses objective and subjective questions", () => {
    const qs = parsePaperQuestions(SAMPLE_PAPER);
    assert.equal(qs.length, 3);
    assert.equal(qs[0].question_id, "11");
    assert.equal(qs[0].type_label, "单选题");
    assert.equal(qs[0].stem_text, "1+1=?");
    assert.equal(qs[0].options.length, 2);
    assert.equal(qs[0].bank, "objective");
    assert.equal(qs[2].bank, "subjective");
    assert.equal(qs[2].supports_save, true);
  });
});

describe("getHomework", () => {
  test("auth_expired without session", async () => {
    const result = await getHomework(
      { todo_id: TODO_QUIZ },
      portsWith(async () => null, {
        async request() {
          throw new Error("http should not run");
        },
      }),
    );
    assert.equal(result.isError, true);
    assert.equal(result.status, "auth_expired");
    assert.equal(result.draft_only, true);
  });

  test("reads structured questions via quiz paper RPC", async () => {
    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed) return warmed;
      if (input.url.startsWith(QUIZ_PAPER_RPC_URL)) {
        assert.equal(input.method, "POST");
        assert.ok(input.json != null);
        assert.deepEqual(input.json, { tid: 301 });
        return { statusCode: 200, body: paperBody() };
      }
      throw new Error(`unexpected ${input.url}`);
    });
    const result = await getHomework(
      { todo_id: TODO_QUIZ, school_short_name: "SJTU" },
      portsWith(async () => SESSION, http),
    );
    assert.equal(result.isError, false);
    assert.equal(result.status, "ok");
    assert.equal(result.paper_type, "quiz");
    assert.equal(result.aid, "90001");
    assert.equal(result.question_count, 3);
    assert.equal(result.questions[0].options[1].content, "B. 2");
    assert.equal(result.draft_only, true);
    assert.ok(calls.some((c) => c.url.startsWith(QUIZ_PAPER_RPC_URL)));
  });

  test("uses homework paper RPC when paper_type=homework", async () => {
    const { http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed) return warmed;
      if (input.url.startsWith(HOMEWORK_PAPER_RPC_URL)) {
        assert.deepEqual(input.json, {
          tid: 301,
          withStdAnswerAndAnalyse: false,
        });
        return {
          statusCode: 200,
          body: paperBody({
            aid: 1,
            tid: 301,
            objectiveQList: [],
            subjectiveQList: [{ id: 9, type: 4, title: "作文" }],
          }),
        };
      }
      throw new Error(`unexpected ${input.url}`);
    });
    const result = await getHomework(
      { todo_id: TODO_QUIZ, paper_type: "homework" },
      portsWith(async () => SESSION, http),
    );
    assert.equal(result.status, "ok");
    assert.equal(result.paper_type, "homework");
    assert.equal(result.questions.length, 1);
  });
});

describe("saveHomeworkAnswers / submitHomework", () => {
  test("save posts submitAnswers with preview:true only", async () => {
    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed) return warmed;
      if (input.url.startsWith(QUIZ_PAPER_RPC_URL)) {
        return { statusCode: 200, body: paperBody() };
      }
      if (input.url.startsWith(SUBMIT_ANSWERS_RPC_URL)) {
        const body = input.json as {
          preview?: unknown;
          paperDto?: { answers?: unknown[] };
        };
        assert.equal(body.preview, true);
        assert.ok(Array.isArray(body.paperDto?.answers));
        assert.equal(body.paperDto?.answers?.length, 1);
        return { statusCode: 200, body: JSON.stringify({ code: 0, result: {} }) };
      }
      throw new Error(`unexpected ${input.url}`);
    });
    const result = await saveHomeworkAnswers(
      {
        todo_id: TODO_QUIZ,
        answers: [{ question_id: "11", option_ids: ["102"] }],
      },
      portsWith(async () => SESSION, http),
    );
    assert.equal(result.isError, false);
    assert.equal(result.status, "ok");
    assert.equal(result.preview, true);
    assert.equal(result.submitted, false);
    assert.equal(result.results[0].status, "saved");
    const submitCall = calls.find((c) => c.url.startsWith(SUBMIT_ANSWERS_RPC_URL));
    assert.ok(submitCall);
    assert.equal((submitCall.json as { preview: boolean }).preview, true);
  });

  test("save rejects smuggled submit/preview=false", async () => {
    const result = await saveHomeworkAnswers(
      {
        todo_id: TODO_QUIZ,
        answers: [{ question_id: "11", option_ids: ["102"] }],
        submit: true,
      } as never,
      portsWith(async () => SESSION, {
        async request() {
          throw new Error("http should not run");
        },
      }),
    );
    assert.equal(result.isError, true);
    assert.equal(result.status, "rejected");
    assert.equal(result.submitted, false);
  });

  test("submit_homework posts preview:false and refuses exam", async () => {
    const exam = await submitHomework(
      {
        todo_id: TODO_EXAM,
        answers: [{ question_id: "11", option_ids: ["102"] }],
      },
      portsWith(async () => SESSION, {
        async request() {
          throw new Error("http should not run");
        },
      }),
    );
    assert.equal(exam.isError, true);
    assert.equal(exam.status, "exam_out_of_scope");
    assert.equal(exam.submitted, false);
    assert.equal(exam.preview, false);

    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed) return warmed;
      if (input.url.startsWith(QUIZ_PAPER_RPC_URL)) {
        return { statusCode: 200, body: paperBody() };
      }
      if (input.url.startsWith(SUBMIT_ANSWERS_RPC_URL)) {
        assert.equal((input.json as { preview: boolean }).preview, false);
        return { statusCode: 200, body: JSON.stringify({ code: 0, result: { score: 10 } }) };
      }
      throw new Error(`unexpected ${input.url}`);
    });
    const result = await submitHomework(
      {
        todo_id: TODO_QUIZ,
        answers: [
          { question_id: "11", option_ids: ["102"] },
          { question_id: "21", text: "F=ma" },
        ],
      },
      portsWith(async () => SESSION, http),
    );
    assert.equal(result.isError, false);
    assert.equal(result.status, "submitted");
    assert.equal(result.submitted, true);
    assert.equal(result.preview, false);
    assert.ok(calls.some((c) => c.url.startsWith(SUBMIT_ANSWERS_RPC_URL)));
  });

  test("save does not mark submitted even on success", async () => {
    const { http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed) return warmed;
      if (input.url.startsWith(QUIZ_PAPER_RPC_URL)) {
        return { statusCode: 200, body: paperBody() };
      }
      if (input.url.startsWith(SUBMIT_ANSWERS_RPC_URL)) {
        return { statusCode: 200, body: JSON.stringify({ code: 0, result: {} }) };
      }
      throw new Error(`unexpected ${input.url}`);
    });
    const result = await saveHomeworkAnswers(
      {
        todo_id: TODO_QUIZ,
        answers: [{ question_id: "21", text: "draft only" }],
      },
      portsWith(async () => SESSION, http),
    );
    assert.equal(result.submitted, false);
    assert.equal(result.preview, true);
    assert.equal(JSON.stringify(result).includes('"submitted":true'), false);
  });
});
