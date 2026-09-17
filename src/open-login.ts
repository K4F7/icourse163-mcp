import { homedir } from "node:os";
import { join } from "node:path";

import {
  chromium,
  type BrowserContext,
  type Cookie,
  type FrameLocator,
  type Page,
} from "playwright-core";

import { cookieHasNtesstudysi } from "./cookie";
import type { WritableCredentialStore } from "./credentials";

export type PasswordCredentials = {
  username: string;
  password: string;
};

export type PasswordLoginRunner = {
  loginWithPassword(credentials: PasswordCredentials): Promise<void>;
};

const HOMEPAGE = "https://www.icourse163.org/";
const LOGIN_IFRAME = "iframe[src*='reg.icourse163.org'][src*='index_dl2']";
const PASSWORD_LOGIN_TIMEOUT_MS = 60_000;
const LOGIN_UI_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;

export const PASSWORD_MODE_SWITCH_LABEL = /密码登录|账号登录|邮箱登录/;

const MISSING_CHROME_MESSAGE =
  "Chrome/Chromium is not installed or the chrome channel is missing. Password login needs Google Chrome or Playwright Chromium (see docs/login.md).";

const NO_DISPLAY_MESSAGE =
  "Cannot open icourse163 login UI (no display / headless). Password login will try headless Chrome; install Chrome/Chromium, or paste a cookie with --cookie-file / ICOURSE163_COOKIE.";

export function cannotOpenLoginUiMessage(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform === "win32" || platform === "darwin") {
    return null;
  }
  const display = env.DISPLAY;
  if (display == null || display.trim() === "") {
    return NO_DISPLAY_MESSAGE;
  }
  return null;
}

export function passwordLoginHeadless(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return cannotOpenLoginUiMessage(env, platform) != null;
}

export function describeLoginFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.trim();
  if (
    /chromium distribution ['"]?chrome['"]? is not found/i.test(text) ||
    /executable doesn't exist/i.test(text) ||
    /browserType\.launch.*chrome/i.test(text)
  ) {
    return MISSING_CHROME_MESSAGE;
  }
  if (
    /missing x server/i.test(text) ||
    /headed browser without having a xserver/i.test(text) ||
    /no display/i.test(text) ||
    /\$DISPLAY/i.test(text)
  ) {
    return NO_DISPLAY_MESSAGE;
  }
  return text.length > 0 ? text : "认证失效";
}

export function redactLoginSecrets(
  message: string,
  credentials: PasswordCredentials,
  extra: readonly string[] = [],
): string {
  let result = message;
  for (const secret of [credentials.password, credentials.username, ...extra]) {
    if (secret.length === 0) {
      continue;
    }
    result = result.split(secret).join("[已隐藏]");
  }
  return result;
}

export function createPlaywrightPasswordLogin(
  credentials: WritableCredentialStore,
  options: {
    env: NodeJS.ProcessEnv;
    platform: NodeJS.Platform;
  },
): PasswordLoginRunner {
  return {
    async loginWithPassword(passwordCreds) {
      const headless = passwordLoginHeadless(options.env, options.platform);
      let context: BrowserContext | undefined;
      try {
        context = await launchBrowserContext(options.env, headless);
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(HOMEPAGE, {
          waitUntil: "domcontentloaded",
          timeout: PASSWORD_LOGIN_TIMEOUT_MS,
        });
        await fillHomepageLogin(page, passwordCreds);
        const cookie = await waitForSessionCookie(context, PASSWORD_LOGIN_TIMEOUT_MS);
        await credentials.setCookie(cookie);
      } finally {
        await context?.close();
      }
    },
  };
}

async function launchBrowserContext(
  env: NodeJS.ProcessEnv,
  headless: boolean,
): Promise<BrowserContext> {
  const profile = join(homedir(), ".icourse163-mcp", "chrome-profile");
  const common = {
    headless,
    viewport: { width: 1280, height: 860 },
  };
  const chromePath = env.ICOURSE163_CHROME?.trim();
  if (chromePath != null && chromePath.length > 0) {
    return chromium.launchPersistentContext(profile, {
      ...common,
      executablePath: chromePath,
    });
  }
  try {
    return await chromium.launchPersistentContext(profile, {
      ...common,
      channel: "chrome",
    });
  } catch (error) {
    if (!looksLikeMissingChrome(error)) {
      throw error;
    }
    return chromium.launchPersistentContext(profile, common);
  }
}

function looksLikeMissingChrome(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    /chromium distribution ['"]?chrome['"]? is not found/i.test(text) ||
    /executable doesn't exist/i.test(text)
  );
}

async function fillHomepageLogin(page: Page, credentials: PasswordCredentials): Promise<void> {
  try {
    await page.keyboard.press("Escape");
  } catch {
    // Popups are optional.
  }

  const iframe = page.locator(LOGIN_IFRAME);
  if ((await iframe.count()) === 0) {
    await clickLoginTrigger(page);
    await page.waitForSelector(LOGIN_IFRAME, { timeout: LOGIN_UI_TIMEOUT_MS });
  }

  const frame = page.frameLocator(LOGIN_IFRAME).first();
  await ensurePasswordMode(frame);

  const userField = frame
    .locator("input[type='text'], input[type='tel']")
    .filter({ visible: true })
    .first();
  await userField.waitFor({ state: "visible", timeout: LOGIN_UI_TIMEOUT_MS });
  await userField.fill(credentials.username);

  const passwordField = frame.locator("input[type='password']").filter({ visible: true }).first();
  await passwordField.waitFor({ state: "visible", timeout: LOGIN_UI_TIMEOUT_MS });
  await passwordField.fill(credentials.password);

  const submit = frame.getByText(/登\s*录/, { exact: false }).first();
  if ((await submit.count()) > 0) {
    await submit.click();
    return;
  }
  const button = frame.locator("button[type='submit'], input[type='submit']").first();
  if ((await button.count()) > 0) {
    await button.click();
    return;
  }
  await passwordField.press("Enter");
}

async function clickLoginTrigger(page: Page): Promise<void> {
  const candidates = [
    page.getByRole("link", { name: /登录/ }),
    page.getByRole("button", { name: /登录/ }),
    page.getByText("登录", { exact: false }),
  ];
  for (const locator of candidates) {
    const first = locator.first();
    try {
      await first.waitFor({ state: "visible", timeout: LOGIN_UI_TIMEOUT_MS });
      await first.click();
      return;
    } catch {
      // Homepage 登录 may be a link, button, or text; SPA hydrates one of them.
    }
  }
  throw new Error("password login: login control not found on homepage");
}

async function ensurePasswordMode(frame: FrameLocator): Promise<void> {
  const visiblePassword = frame.locator("input[type='password']").filter({ visible: true }).first();
  if (await visiblePassword.isVisible()) {
    return;
  }
  const modeSwitch = frame.getByText(PASSWORD_MODE_SWITCH_LABEL).filter({ visible: true }).first();
  try {
    await modeSwitch.waitFor({ state: "visible", timeout: LOGIN_UI_TIMEOUT_MS });
    await modeSwitch.click();
  } catch {
    // Already on password mode, or the tab is absent; fill still waits for the field.
  }
}

async function waitForSessionCookie(
  context: BrowserContext,
  timeoutMs: number,
): Promise<string> {
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    const header = cookieHeaderFrom(await context.cookies());
    if (header != null) {
      return header;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("login wait timeout");
}

function cookieHeaderFrom(cookies: Cookie[]): string | null {
  const hostCookies = cookies.filter((cookie) =>
    /(^|\.)icourse163\.org$/i.test(cookie.domain),
  );
  if (hostCookies.length === 0) {
    return null;
  }
  const header = hostCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  return cookieHasNtesstudysi(header) ? header : null;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
