import { cookieHasNtesstudysi, cookieHasStudyInfo, ntesstudysiFromCookie } from "./cookie";
import {
  fetchTrustedIcourse163,
  type FetchLike,
} from "./http";

export const WARMUP_URL = "https://www.icourse163.org/";

export const COURSE_LIST_RPC_PATH =
  "/web/j/learnerCourseRpcBean.getMyLearnedCoursePanelList.rpc";

export const COURSE_LIST_RPC_URL = `https://www.icourse163.org${COURSE_LIST_RPC_PATH}`;

export type AuthProbeOk = {
  ok: true;
  cookie: string;
};

export type AuthProbeFail = {
  ok: false;
  status: "auth_expired";
  message: string;
};

export type AuthProbeResult = AuthProbeOk | AuthProbeFail;

const MISSING_SESSION_MESSAGE =
  "No icourse163 session (missing NTESSTUDYSI). Run `npm run login` first. MCP tools never take passwords.";

const EXPIRED_SESSION_MESSAGE =
  "icourse163 session is missing or expired (auth_expired). Run `npm run login` again.";

export function missingSessionFailure(message = MISSING_SESSION_MESSAGE): AuthProbeFail {
  return { ok: false, status: "auth_expired", message };
}

export function expiredSessionFailure(message = EXPIRED_SESSION_MESSAGE): AuthProbeFail {
  return { ok: false, status: "auth_expired", message };
}

export async function probeSession(input: {
  cookie: string | null;
  fetchImpl?: FetchLike;
}): Promise<AuthProbeResult> {
  const cookie = input.cookie?.trim() ?? "";
  if (cookie.length === 0 || !cookieHasNtesstudysi(cookie)) {
    return missingSessionFailure();
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  let warmed: Awaited<ReturnType<typeof fetchTrustedIcourse163>>;
  try {
    warmed = await fetchTrustedIcourse163(fetchImpl, {
      url: WARMUP_URL,
      cookie,
      method: "GET",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return expiredSessionFailure(`${EXPIRED_SESSION_MESSAGE} Warm-up failed: ${detail}`);
  }

  if (warmed.statusCode >= 200 && warmed.statusCode < 400 && cookieHasStudyInfo(warmed.cookie)) {
    return { ok: true, cookie: warmed.cookie };
  }

  const csrfKey = ntesstudysiFromCookie(warmed.cookie) ?? ntesstudysiFromCookie(cookie);
  if (csrfKey == null) {
    return expiredSessionFailure();
  }

  let rpc: Awaited<ReturnType<typeof fetchTrustedIcourse163>>;
  try {
    rpc = await fetchTrustedIcourse163(fetchImpl, {
      url: `${COURSE_LIST_RPC_URL}?csrfKey=${encodeURIComponent(csrfKey)}`,
      cookie: warmed.cookie,
      method: "POST",
      form: {
        type: "30",
        p: "1",
        psize: "1",
        courseType: "1",
      },
      headers: {
        origin: "https://www.icourse163.org",
        referer: WARMUP_URL,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return expiredSessionFailure(`${EXPIRED_SESSION_MESSAGE} Course-list probe failed: ${detail}`);
  }

  if (rpcCodeIsZero(rpc.body) && rpc.statusCode >= 200 && rpc.statusCode < 300) {
    return { ok: true, cookie: rpc.cookie.length > 0 ? rpc.cookie : warmed.cookie };
  }

  return expiredSessionFailure();
}

export function rpcCodeIsZero(body: string): boolean {
  try {
    const value: unknown = JSON.parse(body);
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return (value as { code?: unknown }).code === 0;
  } catch {
    return false;
  }
}
