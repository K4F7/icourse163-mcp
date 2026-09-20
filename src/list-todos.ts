import { missingSessionFailure } from "./auth";
import {
  COURSE_PANEL_MAX_PAGES,
  COURSE_PANEL_PAGE_SIZE,
  COURSE_TYPES,
  fetchAllCoursePanels,
  fetchMocTermDto,
  learnReferer,
  parseCoursePanelItems as parseCoursePanelItemsWithType,
  parseMocTermDto,
  resolveSession,
  type CoursePanelItem,
} from "./course-rpc";
import {
  asArray,
  asFiniteNumber,
  asId,
  asNonEmptyString,
  asRecord,
  firstNumber,
} from "./json-util";
import type {
  CredentialStore,
  Icourse163Http,
  Icourse163HttpRequest,
  Icourse163HttpResponse,
  Icourse163Ports,
} from "./ports";
import {
  formatDueAtCst,
  inferTodoKind,
  isOpenTodo,
  type OpenTodoSignals,
} from "./todo-open";

export type {
  CredentialStore,
  Icourse163Http,
  Icourse163HttpRequest,
  Icourse163HttpResponse,
};
export type ListTodosPorts = Icourse163Ports;

export {
  COURSE_PANEL_MAX_PAGES,
  COURSE_PANEL_PAGE_SIZE,
  COURSE_TYPES,
  learnReferer,
  parseMocTermDto,
};

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

export type { CoursePanelItem };

const LEGACY_QUIZ_CONTENT_TYPE = 5;

export async function listTodos(
  ports?: ListTodosPorts,
  now: Date = new Date(),
): Promise<ListTodosResult> {
  if (ports == null) {
    return {
      isError: true,
      status: "auth_expired",
      todos: [],
      errors: [{ where: "credentials", message: missingSessionFailure().message }],
    };
  }

  const session = await resolveSession(ports);
  if (!session.ok) {
    return {
      isError: true,
      status: session.status,
      todos: [],
      errors: session.errors,
    };
  }

  const coursesResult = await fetchAllCoursePanels({
    http: ports.http,
    cookie: session.cookie,
    csrfKey: session.csrfKey,
  });
  if (!coursesResult.ok) {
    return {
      isError: true,
      status: coursesResult.status,
      todos: [],
      errors: coursesResult.errors,
    };
  }

  const todos: TodoItem[] = [];
  const errors: ListTodosError[] = [];
  const seen = new Set<string>();

  for (const course of coursesResult.courses) {
    let moc: Record<string, unknown> | null;
    try {
      moc = await fetchMocTermDto({
        http: ports.http,
        cookie: session.cookie,
        csrfKey: session.csrfKey,
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

/** Back-compat: tests call without type; defaults to mooc. */
export function parseCoursePanelItems(body: string): CoursePanelItem[] | null {
  return parseCoursePanelItemsWithType(body, "mooc");
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
