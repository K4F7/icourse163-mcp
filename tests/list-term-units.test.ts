import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { TERM_RPC_URL, WARMUP_URL } from "../src/auth";
import { learnReferer } from "../src/course-rpc";
import {
  lessonsFromMocTerm,
  listTermUnits,
  mapContentType,
} from "../src/list-term-units";
import { parseMocTermDto } from "../src/course-rpc";
import type { Icourse163Http, Icourse163HttpRequest, Icourse163Ports } from "../src/ports";
import { CATALOG_MOC_TERM_DTO, mocTermBody } from "./fixtures";

const SESSION = "NTESSTUDYSI=test-session";

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

describe("mapContentType", () => {
  test("maps official contentType numbers to video|doc|quiz|other", () => {
    assert.equal(mapContentType(1), "video");
    assert.equal(mapContentType(3), "doc");
    assert.equal(mapContentType(4), "doc");
    assert.equal(mapContentType(5), "quiz");
    assert.equal(mapContentType(6), "other");
    assert.equal(mapContentType(7), "other");
    assert.equal(mapContentType(null), "other");
  });
});

describe("lessonsFromMocTerm", () => {
  test("builds lesson → unit tree with types and learn_status", () => {
    const moc = parseMocTermDto(mocTermBody(CATALOG_MOC_TERM_DTO));
    assert.ok(moc != null);
    const lessons = lessonsFromMocTerm(moc);
    assert.equal(lessons.length, 2);

    const intro = lessons[0];
    assert.equal(intro.id, "21");
    assert.equal(intro.name, "1.1 绪论");
    assert.equal(intro.chapter_id, "11");
    assert.equal(intro.chapter_name, "第一章");
    assert.deepEqual(
      intro.units.map((u) => [u.id, u.type, u.learn_status]),
      [
        ["401", "video", "learned"],
        ["402", "doc", "unlearned"],
        ["403", "doc", null],
        ["404", "quiz", null],
        ["405", "other", null],
      ],
    );

    const quizLesson = lessons[1];
    assert.equal(quizLesson.id, "quiz:301");
    assert.equal(quizLesson.name, "第一章单元测验");
    assert.equal(quizLesson.units.length, 1);
    assert.equal(quizLesson.units[0].type, "quiz");
    assert.equal(quizLesson.units[0].learn_status, "已批改");
  });
});

describe("listTermUnits", () => {
  test("null credentials is auth_expired", async () => {
    const { calls, http } = recordingHttp(() => {
      throw new Error("http should not run");
    });
    const result = await listTermUnits(
      { course_id: "1001", term_id: "2001", school_short_name: "SJTU" },
      portsWith(async () => null, http),
    );
    assert.equal(result.status, "auth_expired");
    assert.equal(result.isError, true);
    assert.deepEqual(result.lessons, []);
    assert.deepEqual(calls, []);
  });

  test("missing course_id/term_id is error", async () => {
    const result = await listTermUnits({ course_id: " ", term_id: "2001" });
    assert.equal(result.status, "error");
    assert.equal(result.isError, true);
  });

  test("returns catalog tree and sends learn Referer", async () => {
    const { calls, http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed != null) {
        return warmed;
      }
      if (input.url.startsWith(TERM_RPC_URL)) {
        return { statusCode: 200, body: mocTermBody(CATALOG_MOC_TERM_DTO) };
      }
      throw new Error(`unexpected url ${input.url}`);
    });
    const result = await listTermUnits(
      { course_id: "1001", term_id: "2001", school_short_name: "SJTU" },
      portsWith(async () => SESSION, http),
    );
    assert.equal(result.status, "ok");
    assert.equal(result.isError, false);
    assert.equal(result.course_id, "1001");
    assert.equal(result.term_id, "2001");
    assert.equal(result.lessons.length, 2);
    assert.equal(result.lessons[0].units[0].type, "video");
    const termCall = calls.find((call) => call.url.startsWith(TERM_RPC_URL));
    assert.ok(termCall != null);
    assert.equal(termCall.form?.termId, "2001");
    assert.equal(
      termCall.headers?.referer,
      learnReferer({
        course_id: "1001",
        term_id: "2001",
        school_short_name: "SJTU",
      }),
    );
    assert.equal(JSON.stringify(result).includes("test-session"), false);
  });
});
