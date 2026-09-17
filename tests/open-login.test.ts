import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  PASSWORD_MODE_SWITCH_LABEL,
  cannotOpenLoginUiMessage,
  describeLoginFailure,
  passwordLoginHeadless,
  redactLoginSecrets,
} from "../src/open-login";

describe("describeLoginFailure", () => {
  test("explains a missing Chrome channel", () => {
    const message = describeLoginFailure(
      new Error(
        "browserType.launchPersistentContext: Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome",
      ),
    );
    assert.match(message, /Chrome|Chromium/i);
  });

  test("explains a headed browser with no X server / DISPLAY", () => {
    const message = describeLoginFailure(
      new Error(
        "Looks like you launched a headed browser without having a XServer running. Set either 'headless: true' or use 'xvfb-run'",
      ),
    );
    assert.match(message, /display|headless|desktop/i);
  });

  test("keeps a login wait timeout message", () => {
    assert.equal(describeLoginFailure(new Error("login wait timeout")), "login wait timeout");
  });
});

describe("cannotOpenLoginUiMessage / passwordLoginHeadless", () => {
  test("is set on linux without DISPLAY", () => {
    const message = cannotOpenLoginUiMessage({ HOME: "/tmp" }, "linux");
    assert.notEqual(message, null);
    assert.equal(passwordLoginHeadless({ HOME: "/tmp" }, "linux"), true);
  });

  test("is null on linux with DISPLAY and on darwin", () => {
    assert.equal(cannotOpenLoginUiMessage({ DISPLAY: ":0" }, "linux"), null);
    assert.equal(cannotOpenLoginUiMessage({}, "darwin"), null);
    assert.equal(passwordLoginHeadless({ DISPLAY: ":0" }, "linux"), false);
  });
});

describe("redactLoginSecrets", () => {
  test("strips username and password from error text", () => {
    const redacted = redactLoginSecrets("failed for alice / s3cret-value", {
      username: "alice",
      password: "s3cret-value",
    });
    assert.doesNotMatch(redacted, /alice/);
    assert.doesNotMatch(redacted, /s3cret-value/);
    assert.match(redacted, /已隐藏/);
  });
});

describe("PASSWORD_MODE_SWITCH_LABEL", () => {
  test("matches URS password-mode tabs", () => {
    assert.match("密码登录", PASSWORD_MODE_SWITCH_LABEL);
    assert.match("账号登录", PASSWORD_MODE_SWITCH_LABEL);
    assert.match("邮箱登录", PASSWORD_MODE_SWITCH_LABEL);
  });

  test("does not match SMS/QR tabs or a bare 登录 submit", () => {
    assert.doesNotMatch("短信登录", PASSWORD_MODE_SWITCH_LABEL);
    assert.doesNotMatch("扫码登录", PASSWORD_MODE_SWITCH_LABEL);
    assert.equal(PASSWORD_MODE_SWITCH_LABEL.test("登录"), false);
  });
});
