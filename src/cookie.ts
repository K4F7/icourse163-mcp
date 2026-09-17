const SESSION_COOKIE = "NTESSTUDYSI";
const STUDY_INFO_COOKIE = "STUDY_INFO";

export function isIcourse163Domain(domain: string): boolean {
  const host = domain.replace(/^\./, "").toLowerCase();
  return host === "icourse163.org" || host.endsWith(".icourse163.org");
}

export function parseCookiePairs(raw: string): Map<string, string> {
  const jar = new Map<string, string>();
  const header = normalizeToCookieHeader(raw);
  if (header.length === 0) {
    return jar;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (name.length === 0) {
      continue;
    }
    jar.set(name, value);
  }
  return jar;
}

export function serializeCookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function normalizeToCookieHeader(raw: string): string {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (trimmed.length === 0) {
    return "";
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  if (/^cookie\s*:/i.test(firstLine)) {
    return trimmed.replace(/^cookie\s*:/i, "").trim().replace(/\r?\n+/g, "; ");
  }
  if (looksLikeNetscape(trimmed)) {
    return serializeCookieHeader(parseNetscape(trimmed));
  }
  return trimmed.replace(/\r?\n+/g, "; ").replace(/(?:;\s*)+/g, "; ");
}

export function ntesstudysiFromCookie(cookie: string): string | null {
  const value = parseCookiePairs(cookie).get(SESSION_COOKIE);
  if (value == null || value.trim() === "") {
    return null;
  }
  return value;
}

export function cookieHasNtesstudysi(cookie: string): boolean {
  return ntesstudysiFromCookie(cookie) != null;
}

export function cookieHasStudyInfo(cookie: string): boolean {
  const value = parseCookiePairs(cookie).get(STUDY_INFO_COOKIE);
  return value != null && value.trim() !== "";
}

export function mergeSetCookies(cookie: string, setCookies: string[]): string {
  const jar = parseCookiePairs(cookie);
  for (const raw of setCookies) {
    const first = raw.split(";")[0]?.trim() ?? "";
    const eq = first.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1);
    if (name.length === 0) {
      continue;
    }
    const domain = cookieAttribute(raw, "domain");
    if (domain != null && !isIcourse163Domain(domain)) {
      continue;
    }
    if (/(?:^|;\s*)max-age=0\b/i.test(raw)) {
      jar.delete(name);
      continue;
    }
    jar.set(name, value);
  }
  return serializeCookieHeader(jar);
}

function looksLikeNetscape(text: string): boolean {
  if (/^#(?: Netscape HTTP Cookie File| HttpOnly_)/im.test(text)) {
    return true;
  }
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#") && trimmed.includes("\t");
  });
}

function parseNetscape(text: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith("#HttpOnly_")) {
      trimmed = trimmed.slice("#HttpOnly_".length);
    } else if (trimmed.startsWith("#")) {
      continue;
    }
    const fields = trimmed.split("\t");
    if (fields.length < 7) {
      continue;
    }
    const domain = fields[0] ?? "";
    const name = fields[5] ?? "";
    const value = fields[6] ?? "";
    if (name.length === 0 || !isIcourse163Domain(domain)) {
      continue;
    }
    jar.set(name, value);
  }
  return jar;
}

function cookieAttribute(raw: string, name: string): string | null {
  const match = raw.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;]*)`, "i"));
  const value = match?.[1]?.trim();
  return value == null || value.length === 0 ? null : value;
}
