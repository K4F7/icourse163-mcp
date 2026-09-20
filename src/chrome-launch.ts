import { chromium, type Browser, type BrowserContext, type LaunchOptions } from "playwright-core";

const MISSING_CHROME_MESSAGE =
  "Chrome/Chromium is not installed or the chrome channel is missing. Playwright study needs Google Chrome or Playwright Chromium (see docs/login.md / docs/mcp.md).";

export function describeChromeLaunchFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.trim();
  if (
    /chromium distribution ['"]?chrome['"]? is not found/i.test(text) ||
    /executable doesn't exist/i.test(text) ||
    /browserType\.launch.*chrome/i.test(text)
  ) {
    return MISSING_CHROME_MESSAGE;
  }
  return text.length > 0 ? text : "Chrome launch failed";
}

export function looksLikeMissingChrome(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    /chromium distribution ['"]?chrome['"]? is not found/i.test(text) ||
    /executable doesn't exist/i.test(text)
  );
}

/** Launch system Chrome (or ICOURSE163_CHROME / bundled Chromium) without a persistent profile. */
export async function launchIcourseChrome(options: {
  headless: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<Browser> {
  const env = options.env ?? process.env;
  const common: LaunchOptions = {
    headless: options.headless,
  };
  const chromePath = env.ICOURSE163_CHROME?.trim();
  if (chromePath != null && chromePath.length > 0) {
    return chromium.launch({ ...common, executablePath: chromePath });
  }
  try {
    return await chromium.launch({ ...common, channel: "chrome" });
  } catch (error) {
    if (!looksLikeMissingChrome(error)) {
      throw error;
    }
    return chromium.launch(common);
  }
}

export async function newIcourseBrowserContext(
  browser: Browser,
): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 1280, height: 860 },
    locale: "zh-CN",
  });
}
