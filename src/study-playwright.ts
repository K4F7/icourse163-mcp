import type { Browser, Cookie, Page } from "playwright-core";

import {
  describeChromeLaunchFailure,
  launchIcourseChrome,
  newIcourseBrowserContext,
} from "./chrome-launch";
import { parseCookiePairs } from "./cookie";
import { learnReferer } from "./course-rpc";
import type { UnitType } from "./list-term-units";


/** page.evaluate callbacks run in the browser; avoid requiring TypeScript DOM lib. */
type DomMedia = {
  muted: boolean;
  playbackRate: number;
  duration: number;
  currentTime: number;
  ended: boolean;
  play: () => Promise<void>;
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void;
};


const MEDIA_WAIT_MS = 90_000;
const NAV_TIMEOUT_MS = 60_000;
const QUIZ_SELECTOR = ".u-questionItem";
const MEDIA_SELECTOR = "video, audio";
const PDF_READER_SELECTOR = ".ux-pdf-reader";
const PDF_NEXT_SELECTOR = ".ux-h5pdfreader_container_footer_pages_next";
const PDF_TOTAL_SELECTOR = ".ux-h5pdfreader_container_footer_pages_total";
const PDF_CURRENT_SELECTOR = ".ux-h5pdfreader_container_footer_pages_in";
const DEFAULT_STUDY_TIMEOUT_MS = 10 * 60_000;

export type StudyPlaywrightArgs = {
  cookie: string;
  course_id: string;
  term_id: string;
  school_short_name: string;
  unit_id: string;
  /** Optional display name to click in the 课件 tree when deep-link fails. */
  unit_name?: string | null;
  content_id: string | null;
  unit_type: Extract<UnitType, "video" | "doc">;
  content_type: number | null;
  playback_rate: number;
  page_interval_sec: number;
  /**
   * When true (default), seek near the end of long media so automation can finish.
   * Set false to play through at playback_rate (may take wall-clock duration/rate).
   */
  seek_near_end?: boolean;
  headless?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Overall timeout for media/PPT completion (default 10 min). */
  timeout_ms?: number;
};

export type StudyPlaywrightOutcome =
  | {
      kind: "completed";
      learned_sec: number | null;
      duration_sec: number | null;
      page_count: number | null;
      percent: number;
    }
  | {
      kind: "needs_quiz_assist";
      message: string;
      learned_sec: number | null;
      duration_sec: number | null;
    }
  | { kind: "page_structure_change"; message: string }
  | { kind: "error"; message: string };

export type StudyPlaywrightRunner = {
  studyUnitInBrowser(args: StudyPlaywrightArgs): Promise<StudyPlaywrightOutcome>;
};

export function buildLearnUnitUrl(input: {
  course_id: string;
  term_id: string;
  school_short_name: string;
  unit_id: string;
  /** Optional display name to click in the 课件 tree when deep-link fails. */
  unit_name?: string | null;
  content_id: string | null;
}): string {
  const base = learnReferer({
    course_id: input.course_id,
    term_id: input.term_id,
    school_short_name: input.school_short_name,
  });
  const cid = (input.content_id ?? input.unit_id).trim();
  const id = input.unit_id.trim();
  return `${base}#/learn/content?type=detail&id=${encodeURIComponent(id)}&cid=${encodeURIComponent(cid)}`;
}

export function cookieHeaderToPlaywrightCookies(header: string): Cookie[] {
  const jar = parseCookiePairs(header);
  const cookies: Cookie[] = [];
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  for (const [name, value] of jar.entries()) {
    cookies.push({
      name,
      value,
      domain: ".icourse163.org",
      path: "/",
      expires,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  return cookies;
}

export function createPlaywrightStudyRunner(): StudyPlaywrightRunner {
  return {
    async studyUnitInBrowser(args) {
      if (process.env.ICOURSE163_DISALLOW_LIVE_PLAYWRIGHT === "1") {
        throw new Error(
          "createPlaywrightStudyRunner invoked while ICOURSE163_DISALLOW_LIVE_PLAYWRIGHT=1 (inject ports.studyPlaywright in tests)",
        );
      }
      return studyUnitWithPlaywright(args);
    },
  };
}

export async function studyUnitWithPlaywright(
  args: StudyPlaywrightArgs,
): Promise<StudyPlaywrightOutcome> {
  const env = args.env ?? process.env;
  const headless = args.headless ?? shouldStudyHeadless(env);
  const seekNearEnd = args.seek_near_end ?? true;
  const timeoutMs = args.timeout_ms ?? DEFAULT_STUDY_TIMEOUT_MS;

  let browser: Browser | undefined;
  try {
    browser = await launchIcourseChrome({ headless, env });
    const context = await newIcourseBrowserContext(browser);
    await context.addCookies(cookieHeaderToPlaywrightCookies(args.cookie));
    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    const learnBase = learnReferer({
      course_id: args.course_id,
      term_id: args.term_id,
      school_short_name: args.school_short_name,
    });
    const url = buildLearnUnitUrl(args);

    // Warm the SPA shell first — cold hash deep-links often show「该课时数据不存在」.
    await page.goto(learnBase, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await dismissLearnDialogs(page);
    await openCoursewareTab(page);
    await dismissLearnDialogs(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await dismissLearnDialogs(page);
    await openCoursewareTab(page);
    await tryClickUnitInTree(page, args.unit_id, args.unit_name ?? null);
    await dismissLearnDialogs(page);

    if (args.unit_type === "doc") {
      return await readPptInPage(page, args.page_interval_sec, args.content_type, timeoutMs);
    }
    return await watchMediaInPage(page, args.playback_rate, seekNearEnd, timeoutMs);
  } catch (error) {
    return {
      kind: "error",
      message: describeChromeLaunchFailure(error),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function dismissLearnDialogs(page: Page): Promise<void> {
  for (const name of ["确定", "关闭", "我知道了", "知道了"]) {
    try {
      const button = page.getByRole("button", { name }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 1000 }).catch(() => undefined);
      }
    } catch {
      // ignore
    }
    try {
      const textNode = page.getByText(name, { exact: true }).first();
      if (await textNode.isVisible().catch(() => false)) {
        await textNode.click({ timeout: 1000 }).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }
}

async function openCoursewareTab(page: Page): Promise<void> {
  for (const locator of [
    page.getByRole("link", { name: "课件" }).first(),
    page.getByRole("tab", { name: "课件" }).first(),
    page.getByText("课件", { exact: true }).first(),
  ]) {
    try {
      if (await locator.isVisible().catch(() => false)) {
        await locator.click({ timeout: 3000 });
        await sleepMs(1500);
        return;
      }
    } catch {
      // try next strategy
    }
  }
}

async function tryClickUnitInTree(
  page: Page,
  unitId: string,
  unitName: string | null,
): Promise<void> {
  const byAttr = page.locator(`[data-id="${unitId}"], [data-unit-id="${unitId}"]`).first();
  if ((await byAttr.count().catch(() => 0)) > 0) {
    await byAttr.click({ timeout: 3000 }).catch(() => undefined);
    await sleepMs(2000);
    return;
  }
  if (unitName != null && unitName.trim() !== "") {
    try {
      const byName = page.getByText(unitName.trim(), { exact: false }).first();
      if (await byName.isVisible().catch(() => false)) {
        await byName.click({ timeout: 5000 });
        await sleepMs(2000);
      }
    } catch {
      // unit may already be selected via deep-link
    }
  }
}

export function shouldStudyHeadless(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === "win32" || platform === "darwin") {
    return env.ICOURSE163_STUDY_HEADED !== "1";
  }
  const display = env.DISPLAY;
  if (display == null || display.trim() === "") {
    return true;
  }
  return env.ICOURSE163_STUDY_HEADED !== "1";
}

async function watchMediaInPage(
  page: Page,
  playbackRate: number,
  seekNearEnd: boolean,
  timeoutMs: number,
): Promise<StudyPlaywrightOutcome> {
  try {
    await page.waitForSelector(MEDIA_SELECTOR, {
      state: "attached",
      timeout: MEDIA_WAIT_MS,
    });
  } catch {
    return {
      kind: "page_structure_change",
      message:
        "Playwright study: video/audio element not found (page/API structure may have changed)",
    };
  }

  await page.evaluate((rate) => {
    const doc = (globalThis as unknown as { document: { querySelector: (s: string) => DomMedia | null } }).document;
    const el = doc.querySelector("video, audio");
    if (el == null) {
      return;
    }
    el.muted = true;
    el.playbackRate = rate;
    void el.play().catch(() => undefined);
  }, playbackRate);

  if (seekNearEnd) {
    await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: { querySelector: (s: string) => DomMedia | null } }).document;
      const el = doc.querySelector("video, audio");
      if (el == null) {
        return;
      }
      const ready = () => {
        if (Number.isFinite(el.duration) && el.duration > 5) {
          el.currentTime = Math.max(0, el.duration - 3);
          void el.play().catch(() => undefined);
        }
      };
      if (Number.isFinite(el.duration) && el.duration > 0) {
        ready();
      } else {
        el.addEventListener("loadedmetadata", ready, { once: true });
      }
    });
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isQuizVisible(page)) {
      const progress = await readMediaProgress(page);
      return {
        kind: "needs_quiz_assist",
        message:
          "Video popup quiz detected (.u-questionItem). Do not silent-submit; use get_homework → AI → save_homework_answers, then retry study_unit.",
        learned_sec: progress.current,
        duration_sec: progress.duration,
      };
    }

    const progress = await readMediaProgress(page);
    if (progress.ended) {
      const duration = progress.duration ?? progress.current;
      return {
        kind: "completed",
        learned_sec: duration,
        duration_sec: duration,
        page_count: null,
        percent: 100,
      };
    }

    await sleepMs(500);
  }

  return {
    kind: "error",
    message: `Playwright study: media did not reach ended within ${timeoutMs}ms`,
  };
}

async function readPptInPage(
  page: Page,
  pageIntervalSec: number,
  contentType: number | null,
  timeoutMs: number,
): Promise<StudyPlaywrightOutcome> {
  // Rich text (contentType 4): OCS reloads once; treat as complete after load.
  if (contentType === 4) {
    await sleepMs(1500);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await sleepMs(1500);
    return {
      kind: "completed",
      learned_sec: null,
      duration_sec: null,
      page_count: 1,
      percent: 100,
    };
  }

  try {
    await page.waitForSelector(PDF_READER_SELECTOR, {
      state: "attached",
      timeout: MEDIA_WAIT_MS,
    });
  } catch {
    return {
      kind: "page_structure_change",
      message:
        "Playwright study: PDF reader (.ux-pdf-reader) not found (page/API structure may have changed)",
    };
  }

  const pages = await page.evaluate(
    ({ totalSel, currentSel }) => {
      const doc = (globalThis as unknown as {
        document: {
          querySelector: (s: string) => {
            childNodes?: { textContent?: string | null }[];
            textContent?: string | null;
            value?: string;
          } | null;
        };
      }).document;
      const totalNode = doc.querySelector(totalSel);
      const totalText =
        totalNode?.childNodes?.[1]?.textContent?.replace(/\s/g, "") ??
        totalNode?.textContent?.replace(/\D/g, "") ??
        "0";
      const total = Number.parseInt(totalText, 10);
      const currentEl = doc.querySelector(currentSel);
      const start = Number.parseInt(currentEl?.value ?? "1", 10);
      return {
        total: Number.isFinite(total) ? total : 0,
        start: Number.isFinite(start) && start > 0 ? start : 1,
      };
    },
    { totalSel: PDF_TOTAL_SELECTOR, currentSel: PDF_CURRENT_SELECTOR },
  );

  if (pages.total <= 0) {
    return {
      kind: "page_structure_change",
      message: "Playwright study: could not read PPT total page count",
    };
  }

  const deadline = Date.now() + timeoutMs;
  for (let index = pages.start; index <= pages.total; index++) {
    if (Date.now() > deadline) {
      return {
        kind: "error",
        message: `Playwright study: PPT page turns exceeded ${timeoutMs}ms`,
      };
    }
    if (index < pages.total) {
      const next = page.locator(PDF_NEXT_SELECTOR).first();
      if ((await next.count()) === 0) {
        return {
          kind: "page_structure_change",
          message: "Playwright study: PPT next-page control not found",
        };
      }
      await next.click();
    }
    if (pageIntervalSec > 0) {
      await sleepMs(pageIntervalSec * 1000);
    }
  }

  return {
    kind: "completed",
    learned_sec: null,
    duration_sec: null,
    page_count: pages.total,
    percent: 100,
  };
}

async function isQuizVisible(page: Page): Promise<boolean> {
  try {
    const loc = page.locator(QUIZ_SELECTOR).first();
    if ((await loc.count()) === 0) {
      return false;
    }
    return loc.isVisible();
  } catch {
    return false;
  }
}

async function readMediaProgress(page: Page): Promise<{
  ended: boolean;
  current: number | null;
  duration: number | null;
}> {
  return page.evaluate(() => {
    const doc = (globalThis as unknown as { document: { querySelector: (s: string) => DomMedia | null } }).document;
    const el = doc.querySelector("video, audio");
    if (el == null) {
      return { ended: false, current: null, duration: null };
    }
    const duration =
      Number.isFinite(el.duration) && el.duration > 0 ? Math.floor(el.duration) : null;
    const current =
      Number.isFinite(el.currentTime) && el.currentTime >= 0
        ? Math.floor(el.currentTime)
        : null;
    return { ended: el.ended === true, current, duration };
  });
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

