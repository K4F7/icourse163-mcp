import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildLearnContentHash,
  buildLearnUnitUrl,
  chooseNavStrategy,
  classifyCourseKind,
  cookieHeaderToPlaywrightCookies,
  textIndicatesMissingUnit,
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

describe("classifyCourseKind", () => {
  test("kaopei and empty school are non_school", () => {
    assert.equal(classifyCourseKind("kaopei"), "non_school");
    assert.equal(classifyCourseKind(""), "non_school");
  });

  test("university short names are school", () => {
    assert.equal(classifyCourseKind("JXUFE"), "school");
  });
});

describe("buildLearnContentHash", () => {
  test("matches buildLearnUnitUrl hash fragment", () => {
    const url = buildLearnUnitUrl({
      course_id: "1473617163",
      term_id: "1475287452",
      school_short_name: "kaopei",
      unit_id: "1303386815",
      content_id: "1231832139",
    });
    const hash = buildLearnContentHash("1303386815", "1231832139");
    assert.ok(url.endsWith(hash), `url=${url} hash=${hash}`);
  });
});

describe("textIndicatesMissingUnit", () => {
  test("detects missing-unit copy", () => {
    assert.equal(textIndicatesMissingUnit("提示：该课时数据不存在"), true);
    assert.equal(textIndicatesMissingUnit("正常课件"), false);
  });
});

describe("chooseNavStrategy", () => {
  test("prefers tree_click when tree produced media", () => {
    assert.equal(
      chooseNavStrategy({
        treeClickSucceeded: true,
        mediaVisible: true,
        missingUnitVisible: false,
        deeplinkMediaVisible: false,
      }),
      "tree_click",
    );
  });

  test("uses deeplink_fallback only when deeplink found media", () => {
    assert.equal(
      chooseNavStrategy({
        treeClickSucceeded: false,
        mediaVisible: false,
        missingUnitVisible: true,
        deeplinkMediaVisible: true,
      }),
      "deeplink_fallback",
    );
  });

  test("returns null when nothing worked", () => {
    assert.equal(
      chooseNavStrategy({
        treeClickSucceeded: false,
        mediaVisible: false,
        missingUnitVisible: true,
        deeplinkMediaVisible: false,
      }),
      null,
    );
  });
});
