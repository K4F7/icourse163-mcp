/** Chinese labels that mean the item is closed / ended / graded-out. */
export const CLOSED_STATE_LABELS = [
  "已提交",
  "已交",
  "已完成",
  "已结束",
  "已关闭",
  "已截止",
  "已过期",
  "已批改",
  "已批阅",
  "待批阅",
  "不可作答",
  "已评",
  "已阅",
] as const;

/** Chinese labels that mean still-open (未完成 / 未交 / 可作答). */
export const OPEN_STATE_LABELS = [
  "未完成",
  "未交",
  "未提交",
  "可作答",
  "待完成",
  "待交",
] as const;

export const TODO_KIND_HOMEWORK = "作业";
export const TODO_KIND_QUIZ = "测验";
export const TODO_KIND_EXAM = "考试";

const CST_OFFSET = "+08:00";
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

export type OpenTodoSignals = {
  deadlineMs: number | null;
  score: number | null;
  usedTryCount: number | null;
  statusText: string | null;
};

export function hasClosedStateLabel(text: string | null | undefined): boolean {
  if (text == null || text.trim() === "") {
    return false;
  }
  return CLOSED_STATE_LABELS.some((label) => text.includes(label));
}

export function hasOpenStateLabel(text: string | null | undefined): boolean {
  if (text == null || text.trim() === "") {
    return false;
  }
  return OPEN_STATE_LABELS.some((label) => text.includes(label));
}

export function isSubmittedTryCount(usedTryCount: number | null): boolean {
  return usedTryCount != null && usedTryCount > 0;
}

export function hasGradedScore(score: number | null): boolean {
  return score != null && score > 0;
}

/**
 * Open filter for list_todos: still 未完成/未交/可作答.
 * Past deadline, submitted tries, graded scores, and closed-state labels are out.
 * Missing deadline is kept only when the item is otherwise clearly unfinished.
 */
export function isOpenTodo(signals: OpenTodoSignals, now: Date): boolean {
  if (hasClosedStateLabel(signals.statusText)) {
    return false;
  }
  if (isSubmittedTryCount(signals.usedTryCount)) {
    return false;
  }
  if (hasGradedScore(signals.score)) {
    return false;
  }
  if (signals.deadlineMs == null) {
    return isClearlyUnfinished(signals);
  }
  return signals.deadlineMs > now.getTime();
}

export function isClearlyUnfinished(signals: OpenTodoSignals): boolean {
  return (
    !hasClosedStateLabel(signals.statusText) &&
    !isSubmittedTryCount(signals.usedTryCount) &&
    !hasGradedScore(signals.score)
  );
}

export function formatDueAtCst(deadlineMs: number): string {
  const shifted = new Date(deadlineMs + CST_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 19)}${CST_OFFSET}`;
}

export function inferTodoKind(input: {
  source: "quiz" | "unit" | "exam" | "homework";
  name: string;
}): string {
  if (input.source === "exam" || /考试/.test(input.name)) {
    return TODO_KIND_EXAM;
  }
  if (input.source === "homework" || /作业/.test(input.name)) {
    return TODO_KIND_HOMEWORK;
  }
  return TODO_KIND_QUIZ;
}
