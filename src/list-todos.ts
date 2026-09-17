import {
  COURSE_LIST_RPC_URL,
  TERM_RPC_URL,
  WARMUP_URL,
  missingSessionFailure,
  probeSession,
  rpcCodeIsZero,
} from "./auth";
import { ntesstudysiFromCookie } from "./cookie";
import {
  formatDueAtCst,
  inferTodoKind,
  isOpenTodo,
  type OpenTodoSignals,
} from "./todo-open";

export type ListTodosStatus = "ok" | "auth_expired" | "error";

export type ListTodosError = {
  where: string;
  message: string;
};

export type TodoItem = {
  id: string;
  title: string;
  course_title: string;
  due_at: string | null;
  kind: string;
};

export type ListTodosResult = {
  isError: boolean;
  status: ListTodosStatus;
  todos: TodoItem[];
  errors: ListTodosError[];
};

export type CredentialStore = {
  getCookie(): Promise<string | null>;
};

export type Icourse163HttpRequest = {
  url: string;
  cookie: string;
  method?: "GET" | "POST";
  form?: Record<string, string>;
  headers?: Record<string, string>;
};

export type Icourse163HttpResponse = {
  statusCode: number;
  url: string;
  body: string;
  cookie: string;
};

export type Icourse163Http = {
  request(input: Icourse163HttpRequest): Promise<Icourse163HttpResponse>;
};

export type ListTodosPorts = {
  credentials: CredentialStore;
  http: Icourse163Http;
};

export const COURSE_PANEL_PAGE_SIZE = 20;
export const COURSE_PANEL_MAX_PAGES = 20;
export const COURSE_TYPES = ["1", "2"] as const;

export type CoursePanelItem = {
  name: string;
  course_id: string;
  term_id: string;
  school_short_name: string;
};

const ORIGIN = "https://www.icourse163.org";
const LEGACY_QUIZ_CONTENT_TYPE = 5;

export async function listTodos(
  ports?: ListTodosPorts,
  now: Date = new Date(),
): Promise<ListTodosResult> {
  if (ports == null) {
    return authExpiredResult(missingSessionFailure().message);
  }

  let stored: string | null;
  try {
    stored = await ports.credentials.getCookie();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorResult("credentials", `Failed to read stored session: ${detail}`);
  }

  const probed = await probeSession({ cookie: stored, http: ports.http });
  if (!probed.ok) {
    return authExpiredResult(probed.message);
  }

  const cookie = probed.cookie;
  const csrfKey = ntesstudysiFromCookie(cookie);
  if (csrfKey == null) {
    return authExpiredResult(missingSessionFailure().message);
  }

  const coursesResult = await fetchAllCoursePanels({
    http: ports.http,
    cookie,
    csrfKey,
  });
  if (!coursesResult.ok) {
    return coursesResult.failure;
  }

  const todos: TodoItem[] = [];
  const errors: ListTodosError[] = [];
  const seen = new Set<string>();

  for (const course of coursesResult.courses) {
    let moc: Record<string, unknown> | null;
    try {
      moc = await fetchMocTermDto({
        http: ports.http,
        cookie,
        csrfKey,
        course,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push({
        where: course.name,
        message: `Term structure RPC failed: ${detail}`,
      });
      continue;
    }
    if (moc == null) {
      errors.push({
        where: course.name,
        message: "Term structure RPC returned no mocTermDto",
      });
      continue;
    }
    for (const todo of todosFromMocTerm(moc, course, now)) {
      if (seen.has(todo.id)) {
        continue;
      }
      seen.add(todo.id);
      todos.push(todo);
    }
  }

  todos.sort(compareTodos);

  if (todos.length === 0 && errors.length > 0) {
    return {
      isError: true,
      status: "error",
      todos: [],
      errors,
    };
  }

  return {
    isError: false,
    status: "ok",
    todos,
    errors,
  };
}

export function learnReferer(course: CoursePanelItem): string {
  const slug =
    course.school_short_name.length > 0
      ? `${course.school_short_name}-${course.course_id}`
      : course.course_id;
  return `${ORIGIN}/learn/${slug}?tid=${course.term_id}`;
}

export function parseCoursePanelItems(body: string): CoursePanelItem[] | null {
  const json = parseJsonObject(body);
  if (json == null || json.code !== 0) {
    return null;
  }
  const result = asRecord(json.result);
  if (result == null) {
    return [];
  }
  const items: CoursePanelItem[] = [];
  for (const raw of asArray(result.result)) {
    const item = asRecord(raw);
    if (item == null) {
      continue;
    }
    const courseId = asId(item.id);
    const term = asRecord(item.termPanel);
    const termId = term == null ? null : asId(term.id);
    if (courseId == null || termId == null) {
      continue;
    }
    const school = asRecord(item.schoolPanel);
    items.push({
      name: asNonEmptyString(item.name) ?? "未命名课程",
      course_id: courseId,
      term_id: termId,
      school_short_name: asNonEmptyString(school?.shortName) ?? "",
    });
  }
  return items;
}

export function parseMocTermDto(body: string): Record<string, unknown> | null {
  const json = parseJsonObject(body);
  if (json == null || json.code !== 0) {
    return null;
  }
  const result = asRecord(json.result);
  if (result == null) {
    return null;
  }
  const moc = asRecord(result.mocTermDto);
  return moc ?? result;
}

export function todosFromMocTerm(
  moc: Record<string, unknown>,
  course: CoursePanelItem,
  now: Date,
): TodoItem[] {
  const todos: TodoItem[] = [];
  for (const chapter of asArray(moc.chapters)) {
    const chapterRec = asRecord(chapter);
    if (chapterRec == null) {
      continue;
    }
    for (const quiz of asArray(chapterRec.quizs)) {
      const todo = todoFromQuiz(quiz, course, now);
      if (todo != null) {
        todos.push(todo);
      }
    }
    for (const lesson of asArray(chapterRec.lessons)) {
      const lessonRec = asRecord(lesson);
      if (lessonRec == null) {
        continue;
      }
      for (const unit of asArray(lessonRec.units)) {
        const todo = todoFromLegacyUnit(unit, course, now);
        if (todo != null) {
          todos.push(todo);
        }
      }
    }
  }
  for (const exam of asArray(moc.exams)) {
    const todo = todoFromExam(exam, course, now);
    if (todo != null) {
      todos.push(todo);
    }
  }
  return todos;
}

function todoFromQuiz(
  raw: unknown,
  course: CoursePanelItem,
  now: Date,
): TodoItem | null {
  const quiz = asRecord(raw);
  if (quiz == null) {
    return null;
  }
  const test = asRecord(quiz.test) ?? {};
  const name = asNonEmptyString(quiz.name) ?? asNonEmptyString(test.name) ?? "未知测验";
  const id = asId(quiz.id) ?? asId(test.id);
  if (id == null) {
    return null;
  }
  const signals = signalsFrom(test, quiz, ["deadline", "endTime", "testEndTime"]);
  if (!isOpenTodo(signals, now)) {
    return null;
  }
  return toTodo({
    course,
    source: "quiz",
    id,
    name,
    deadlineMs: signals.deadlineMs,
  });
}

function todoFromLegacyUnit(
  raw: unknown,
  course: CoursePanelItem,
  now: Date,
): TodoItem | null {
  const unit = asRecord(raw);
  if (unit == null || asFiniteNumber(unit.contentType) !== LEGACY_QUIZ_CONTENT_TYPE) {
    return null;
  }
  const name = asNonEmptyString(unit.name) ?? "未知测验";
  const id = asId(unit.id);
  if (id == null) {
    return null;
  }
  const signals = signalsFrom(unit, {}, ["deadline", "testEndTime", "endTime"]);
  if (!isOpenTodo(signals, now)) {
    return null;
  }
  return toTodo({
    course,
    source: "unit",
    id,
    name,
    deadlineMs: signals.deadlineMs,
  });
}

function todoFromExam(
  raw: unknown,
  course: CoursePanelItem,
  now: Date,
): TodoItem | null {
  const exam = asRecord(raw);
  if (exam == null) {
    return null;
  }
  const test = asRecord(exam.test) ?? {};
  const name =
    asNonEmptyString(exam.name) ??
    asNonEmptyString(exam.title) ??
    asNonEmptyString(test.name) ??
    "未知考试";
  const id = asId(exam.id) ?? asId(test.id);
  if (id == null) {
    return null;
  }
  const signals = signalsFrom(test, exam, ["endTime", "deadline", "testEndTime"]);
  if (!isOpenTodo(signals, now)) {
    return null;
  }
  return toTodo({
    course,
    source: "exam",
    id,
    name,
    deadlineMs: signals.deadlineMs,
  });
}

function signalsFrom(
  primary: Record<string, unknown>,
  extra: Record<string, unknown>,
  deadlineKeys: readonly string[],
): OpenTodoSignals {
  return {
    deadlineMs: firstNumber(
      ...deadlineKeys.map((key) => primary[key]),
      ...deadlineKeys.map((key) => extra[key]),
    ),
    score: firstNumber(
      primary.userScore,
      primary.testScore,
      extra.userScore,
      extra.testScore,
    ),
    usedTryCount: firstNumber(primary.usedTryCount, extra.usedTryCount),
    statusText: collectStatusText(primary, extra),
  };
}

function collectStatusText(
  ...records: Record<string, unknown>[]
): string | null {
  const keys = [
    "evaluateStatus",
    "testStatus",
    "status",
    "statusName",
    "evaluateStatusName",
  ];
  const parts: string[] = [];
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") {
        parts.push(value);
      }
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function toTodo(input: {
  course: CoursePanelItem;
  source: "quiz" | "unit" | "exam";
  id: string;
  name: string;
  deadlineMs: number | null;
}): TodoItem {
  return {
    id: `${input.course.course_id}:${input.course.term_id}:${input.source}:${input.id}`,
    title: input.name,
    course_title: input.course.name,
    due_at: input.deadlineMs == null ? null : formatDueAtCst(input.deadlineMs),
    kind: inferTodoKind({ source: input.source, name: input.name }),
  };
}

async function fetchAllCoursePanels(input: {
  http: Icourse163Http;
  cookie: string;
  csrfKey: string;
}): Promise<
  | { ok: true; courses: CoursePanelItem[] }
  | { ok: false; failure: ListTodosResult }
> {
  const courses: CoursePanelItem[] = [];
  const seen = new Set<string>();
  for (const courseType of COURSE_TYPES) {
    for (let page = 1; page <= COURSE_PANEL_MAX_PAGES; page += 1) {
      let response: Icourse163HttpResponse;
      try {
        response = await input.http.request({
          url: `${COURSE_LIST_RPC_URL}?csrfKey=${encodeURIComponent(input.csrfKey)}`,
          cookie: input.cookie,
          method: "POST",
          form: {
            type: "30",
            p: String(page),
            psize: String(COURSE_PANEL_PAGE_SIZE),
            courseType,
          },
          headers: {
            origin: ORIGIN,
            referer: WARMUP_URL,
          },
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { ok: false, failure: errorResult("course_panel", detail) };
      }
      if (isAuthFailureResponse(response)) {
        return {
          ok: false,
          failure: authExpiredResult(
            "icourse163 session is missing or expired (auth_expired). Run `npm run login` again.",
          ),
        };
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          ok: false,
          failure: errorResult(
            "course_panel",
            `Course panel RPC HTTP ${response.statusCode}`,
          ),
        };
      }
      const items = parseCoursePanelItems(response.body);
      if (items == null) {
        if (!rpcCodeIsZero(response.body)) {
          return {
            ok: false,
            failure: authExpiredResult(
              "icourse163 session is missing or expired (auth_expired). Run `npm run login` again.",
            ),
          };
        }
        return {
          ok: false,
          failure: errorResult("course_panel", "Course panel RPC parse failed"),
        };
      }
      for (const item of items) {
        const key = `${item.course_id}:${item.term_id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        courses.push(item);
      }
      if (items.length === 0 || items.length < COURSE_PANEL_PAGE_SIZE) {
        break;
      }
    }
  }
  return { ok: true, courses };
}

async function fetchMocTermDto(input: {
  http: Icourse163Http;
  cookie: string;
  csrfKey: string;
  course: CoursePanelItem;
}): Promise<Record<string, unknown> | null> {
  const response = await input.http.request({
    url: `${TERM_RPC_URL}?csrfKey=${encodeURIComponent(input.csrfKey)}`,
    cookie: input.cookie,
    method: "POST",
    form: { termId: input.course.term_id },
    headers: {
      origin: ORIGIN,
      referer: learnReferer(input.course),
    },
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    return null;
  }
  return parseMocTermDto(response.body);
}

function isAuthFailureResponse(response: Icourse163HttpResponse): boolean {
  if (response.statusCode === 401 || response.statusCode === 403) {
    return true;
  }
  const trimmed = response.body.trim();
  if (trimmed.length > 0 && !trimmed.startsWith("{") && /登录|login/i.test(trimmed)) {
    return true;
  }
  return false;
}

function authExpiredResult(message: string): ListTodosResult {
  return {
    isError: true,
    status: "auth_expired",
    todos: [],
    errors: [{ where: "credentials", message }],
  };
}

function errorResult(where: string, message: string): ListTodosResult {
  return {
    isError: true,
    status: "error",
    todos: [],
    errors: [{ where, message }],
  };
}

function compareTodos(a: TodoItem, b: TodoItem): number {
  if (a.due_at == null && b.due_at == null) {
    return a.title.localeCompare(b.title, "zh");
  }
  if (a.due_at == null) {
    return 1;
  }
  if (b.due_at == null) {
    return -1;
  }
  const byDue = a.due_at.localeCompare(b.due_at);
  return byDue !== 0 ? byDue : a.title.localeCompare(b.title, "zh");
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return asRecord(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return asNonEmptyString(value);
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asFiniteNumber(value);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}
