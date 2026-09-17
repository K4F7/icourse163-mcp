import assert from "node:assert/strict";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  cookieHasNtesstudysi,
  cookieHasStudyInfo,
  mergeSetCookies,
  normalizeToCookieHeader,
  ntesstudysiFromCookie,
} from "../src/cookie";
import {
  createFileCredentialStore,
  defaultSessionFilePath,
} from "../src/credentials";

const SESSION = "NTESSTUDYSI=test-session";
const WITH_INFO = `${SESSION}; STUDY_INFO=test-study-info`;

describe("cookie helpers", () => {
  test("extracts NTESSTUDYSI from a Cookie header", () => {
    assert.equal(ntesstudysiFromCookie(WITH_INFO), "test-session");
    assert.equal(cookieHasNtesstudysi(WITH_INFO), true);
    assert.equal(cookieHasStudyInfo(WITH_INFO), true);
  });

  test("rejects cookies without NTESSTUDYSI", () => {
    assert.equal(cookieHasNtesstudysi("FOO=bar"), false);
    assert.equal(ntesstudysiFromCookie("FOO=bar"), null);
  });

  test("strips a Cookie: prefix and collapses newlines", () => {
    const header = normalizeToCookieHeader("Cookie: NTESSTUDYSI=test-session\nSTUDY_INFO=x");
    assert.equal(cookieHasNtesstudysi(header), true);
    assert.equal(ntesstudysiFromCookie(header), "test-session");
  });

  test("parses Netscape cookies.txt for icourse163.org", () => {
    const text = [
      "# Netscape HTTP Cookie File",
      ".icourse163.org\tTRUE\t/\tTRUE\t0\tNTESSTUDYSI\ttest-session",
      ".example.com\tTRUE\t/\tTRUE\t0\tNTESSTUDYSI\tother-host",
    ].join("\n");
    const header = normalizeToCookieHeader(text);
    assert.equal(ntesstudysiFromCookie(header), "test-session");
    assert.doesNotMatch(header, /other-host/);
  });

  test("merges Set-Cookie STUDY_INFO and ignores other hosts", () => {
    const merged = mergeSetCookies(SESSION, [
      "STUDY_INFO=test-study-info; Domain=.icourse163.org; Path=/",
      "evil=1; Domain=example.com; Path=/",
    ]);
    assert.equal(cookieHasStudyInfo(merged), true);
    assert.equal(ntesstudysiFromCookie(merged), "test-session");
    assert.doesNotMatch(merged, /evil=/);
  });
});

describe("file credential store", () => {
  test("roundtrips a cookie at 0600 under an explicit path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "icourse163-session-"));
    const path = join(dir, "session");
    const store = createFileCredentialStore({ path });

    assert.equal(await store.getCookie(), null);
    await store.setCookie(WITH_INFO);
    assert.equal(await store.getCookie(), WITH_INFO);

    if (process.platform !== "win32") {
      const info = await stat(path);
      assert.equal(info.mode & 0o777, 0o600);
    }

    await store.clearCookie();
    assert.equal(await store.getCookie(), null);
  });

  test("defaultSessionFilePath prefers XDG_CONFIG_HOME", () => {
    assert.equal(
      defaultSessionFilePath({ XDG_CONFIG_HOME: "/tmp/xdg-config" }, "/home/user"),
      "/tmp/xdg-config/icourse163-mcp/session",
    );
    assert.equal(
      defaultSessionFilePath({}, "/home/user"),
      "/home/user/.config/icourse163-mcp/session",
    );
  });

  test("empty file is treated as missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "icourse163-session-"));
    const path = join(dir, "session");
    await writeFile(path, "  \n", "utf8");
    const store = createFileCredentialStore({ path });
    assert.equal(await store.getCookie(), null);
  });
});
