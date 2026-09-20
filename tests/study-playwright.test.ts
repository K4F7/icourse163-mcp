import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildLearnUnitUrl,
  cookieHeaderToPlaywrightCookies,
} from "../src/study-playwright";

describe("buildLearnUnitUrl", () => {
  test("builds learn hash URL with unit and content ids", () => {
    const url = buildLearnUnitUrl({
      course_id: "1473617163",
      term_id: "2001",
      school_short_name: "kaopei",
      unit_id: "1303386815",
      content_id: "1231832139",
    });
    assert.equal(
      url,
      "https://www.icourse163.org/learn/kaopei-1473617163?tid=2001#/learn/content?type=detail&id=1303386815&cid=1231832139",
    );
  });

  test("falls back cid to unit_id when content_id missing", () => {
    const url = buildLearnUnitUrl({
      course_id: "1001",
      term_id: "2001",
      school_short_name: "",
      unit_id: "401",
      content_id: null,
    });
    assert.match(url, /#\/learn\/content\?type=detail&id=401&cid=401$/);
  });
});

describe("cookieHeaderToPlaywrightCookies", () => {
  test("maps cookie header pairs to icourse163 domain cookies", () => {
    const cookies = cookieHeaderToPlaywrightCookies(
      "NTESSTUDYSI=abc; STUDY_INFO=xyz",
    );
    assert.equal(cookies.length, 2);
    assert.equal(cookies[0]?.domain, ".icourse163.org");
    assert.equal(cookies[0]?.path, "/");
    const names = cookies.map((c) => c.name).sort();
    assert.deepEqual(names, ["NTESSTUDYSI", "STUDY_INFO"]);
  });
});
