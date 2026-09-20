import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CLOSED_STATE_LABELS,
  OPEN_STATE_LABELS,
  TODO_KIND_EXAM,
  TODO_KIND_HOMEWORK,
  TODO_KIND_QUIZ,
  formatDueAtCst,
  hasClosedStateLabel,
  hasOpenStateLabel,
  inferTodoKind,
  isClearlyUnfinished,
  isOpenTodo,
} from "../src/todo-open";
import { FUTURE_ISO, FUTURE_MS, NOW_ISO, PAST_MS } from "./fixtures";

const NOW = new Date(NOW_ISO);

describe("closed-state heuristics", () => {
  test("named constants include 已提交 / 已批改 / 已结束", () => {
    assert.ok(CLOSED_STATE_LABELS.includes("已提交"));
    assert.ok(CLOSED_STATE_LABELS.includes("已批改"));
    assert.ok(CLOSED_STATE_LABELS.includes("已结束"));
    assert.ok(OPEN_STATE_LABELS.includes("未完成"));
    assert.ok(OPEN_STATE_LABELS.includes("未交"));
    assert.ok(OPEN_STATE_LABELS.includes("可作答"));
  });

  test("hasClosedStateLabel matches each closed constant", () => {
    for (const label of CLOSED_STATE_LABELS) {
      assert.equal(hasClosedStateLabel(label), true, label);
      assert.equal(hasClosedStateLabel(`状态：${label}`), true, label);
    }
  });

  test("open labels 未完成/未交/可作答 are not treated as closed", () => {
    for (const label of OPEN_STATE_LABELS) {
      assert.equal(hasClosedStateLabel(label), false, label);
      assert.equal(hasOpenStateLabel(label), true, label);
    }
  });
});

describe("isOpenTodo", () => {
  test("keeps a future-deadline unfinished quiz", () => {
    assert.equal(
      isOpenTodo(
        { deadlineMs: FUTURE_MS, score: 0, usedTryCount: 0, statusText: "未完成" },
        NOW,
      ),
      true,
    );
  });

  test("drops submitted usedTryCount>0", () => {
    assert.equal(
      isOpenTodo(
        { deadlineMs: FUTURE_MS, score: 0, usedTryCount: 1, statusText: null },
        NOW,
      ),
      false,
    );
  });

  test("drops graded score>0 and past deadline", () => {
    assert.equal(
      isOpenTodo(
        { deadlineMs: FUTURE_MS, score: 88, usedTryCount: 0, statusText: null },
        NOW,
      ),
      false,
    );
    assert.equal(
      isOpenTodo(
        { deadlineMs: PAST_MS, score: 0, usedTryCount: 0, statusText: null },
        NOW,
      ),
      false,
    );
  });

  test("drops closed-state labels even with a future deadline", () => {
    assert.equal(
      isOpenTodo(
        { deadlineMs: FUTURE_MS, score: 0, usedTryCount: 0, statusText: "已结束" },
        NOW,
      ),
      false,
    );
  });

  test("missing deadline is kept only when clearly unfinished", () => {
    assert.equal(
      isOpenTodo(
        { deadlineMs: null, score: null, usedTryCount: null, statusText: "可作答" },
        NOW,
      ),
      true,
    );
    assert.equal(
      isClearlyUnfinished({
        deadlineMs: null,
        score: 12,
        usedTryCount: null,
        statusText: null,
      }),
      false,
    );
    assert.equal(
      isOpenTodo(
        { deadlineMs: null, score: 12, usedTryCount: null, statusText: null },
        NOW,
      ),
      false,
    );
    assert.equal(
      isOpenTodo(
        { deadlineMs: null, score: 0, usedTryCount: 3, statusText: null },
        NOW,
      ),
      false,
    );
  });
});

describe("formatDueAtCst", () => {
  test("formats millisecond timestamps as ISO+08:00", () => {
    assert.equal(formatDueAtCst(FUTURE_MS), FUTURE_ISO);
  });
});

describe("inferTodoKind", () => {
  test("maps exam / 作业 / default 测验", () => {
    assert.equal(inferTodoKind({ source: "exam", name: "期末" }), TODO_KIND_EXAM);
    assert.equal(inferTodoKind({ source: "quiz", name: "第三章作业" }), TODO_KIND_HOMEWORK);
    assert.equal(inferTodoKind({ source: "unit", name: "单元测验" }), TODO_KIND_QUIZ);
    assert.equal(inferTodoKind({ source: "homework", name: "编程练习" }), TODO_KIND_HOMEWORK);
    assert.equal(inferTodoKind({ source: "quiz", name: "期中考试" }), TODO_KIND_EXAM);
  });
});
