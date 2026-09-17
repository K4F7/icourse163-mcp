import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createFetchIcourse163Http, isTrustedIcourse163Url } from "../src/http";

const COOKIE = "NTESSTUDYSI=test-session";
const UNTRUSTED = "https://example.com/steal";
const TRUSTED = "https://www.icourse163.org/";

describe("isTrustedIcourse163Url", () => {
  test("allows icourse163.org https hosts", () => {
    assert.equal(isTrustedIcourse163Url("https://www.icourse163.org/"), true);
    assert.equal(isTrustedIcourse163Url("https://reg.icourse163.org/index.htm"), true);
  });

  test("rejects other hosts and http", () => {
    assert.equal(isTrustedIcourse163Url(UNTRUSTED), false);
    assert.equal(isTrustedIcourse163Url("http://www.icourse163.org/"), false);
  });
});

describe("createFetchIcourse163Http", () => {
  test("rejects a cookie-bearing request to a non-icourse163 URL without issuing fetch", async () => {
    const calls: string[] = [];
    const http = createFetchIcourse163Http(async (url) => {
      calls.push(url);
      return new Response("should not run", { status: 200 });
    });

    await assert.rejects(() => http.request({ url: UNTRUSTED, cookie: COOKIE }));
    assert.deepEqual(calls, []);
  });

  test("does not follow a redirect off icourse163.org", async () => {
    const calls: string[] = [];
    const http = createFetchIcourse163Http(async (url) => {
      calls.push(url);
      if (url === TRUSTED) {
        return new Response("", {
          status: 302,
          headers: { Location: UNTRUSTED },
        });
      }
      return new Response("should not run", { status: 200 });
    });

    await assert.rejects(() => http.request({ url: TRUSTED, cookie: COOKIE }));
    assert.deepEqual(calls, [TRUSTED]);
  });
});
