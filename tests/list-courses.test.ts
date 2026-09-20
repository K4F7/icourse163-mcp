import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { COURSE_LIST_RPC_URL, WARMUP_URL } from "../src/auth";
import { listCourses } from "../src/list-courses";
import type { Icourse163Http, Icourse163HttpRequest, Icourse163Ports } from "../src/ports";
import {
  EMPTY_COURSE_PANEL_BODY,
  MOOC_COURSE,
  SPOC_COURSE,
  coursePanelBody,
} from "./fixtures";

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

describe("listCourses", () => {
  test("null credentials is auth_expired with isError", async () => {
    const { calls, http } = recordingHttp(() => {
      throw new Error("http should not run");
    });
    const result = await listCourses(portsWith(async () => null, http));
    assert.equal(result.status, "auth_expired");
    assert.equal(result.isError, true);
    assert.deepEqual(result.courses, []);
    assert.deepEqual(calls, []);
    assert.equal(JSON.stringify(result).includes("test-session"), false);
  });

  test("missing ports is auth_expired", async () => {
    const result = await listCourses(undefined);
    assert.equal(result.status, "auth_expired");
    assert.equal(result.isError, true);
    assert.deepEqual(result.courses, []);
  });

  test("empty panels is ok with courses []", async () => {
    const { http } = recordingHttp((input) => {
      const warmed = warmupOk(input);
      if (warmed != null) {
        return warmed;
      }
      if (input.url.startsWith(COURSE_LIST_RPC_URL)) {
        return { statusCode: 200, body: EMPTY_COURSE_PANEL_BODY };
      }
      throw new Error(`unexpected url ${input.url}`);
    });
    const result = await listCourses(portsWith(async () => SESSION, http));
    assert.equal(result.status, "ok");
    assert.equal(result.isError, false);
    assert.deepEqual(result.courses, []);
  });

  test("returns enrolled MOOC and SPOC with stable shape", async () => {
    const { http } = recordingHttp((input) => {
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
      throw new Error(`unexpected url ${input.url}`);
    });
    const result = await listCourses(portsWith(async () => SESSION, http));
    assert.equal(result.status, "ok");
    assert.equal(result.isError, false);
    assert.deepEqual(result.courses, [
      {
        id: "1001",
        name: "大学物理",
        school: "SJTU",
        type: "mooc",
        term_id: "2001",
      },
      {
        id: "1002",
        name: "SPOC实验课",
        school: "SJTU",
        type: "spoc",
        term_id: "2002",
      },
    ]);
    assert.equal(JSON.stringify(result).includes("NTESSTUDYSI"), false);
    assert.equal(JSON.stringify(result).includes("test-session"), false);
  });
});
