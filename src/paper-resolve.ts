import {
  asArray,
  asFiniteNumber,
  asId,
  asNonEmptyString,
  asRecord,
} from "./json-util";
import type { ToolError } from "./course-rpc";

export type PaperType = "quiz" | "homework";

export type ParsedTodoId = {
  course_id: string;
  term_id: string;
  source: "quiz" | "unit" | "exam" | "homework";
  content_id: string;
};

export type PaperTargetOk = {
  ok: true;
  tid: string;
  paper_type: PaperType;
  catalog_id: string;
  title: string | null;
};

export type PaperTargetFail = {
  ok: false;
  status: "not_found" | "unsupported";
  errors: ToolError[];
};

export type PaperTarget = PaperTargetOk | PaperTargetFail;

export function resolvePaperType(
  parsed: ParsedTodoId,
  override?: PaperType,
): PaperType {
  if (override != null) {
    return override;
  }
  if (parsed.source === "homework") {
    return "homework";
  }
  // Homework paper RPC is for chapters.homeworks; default quiz for chapter quizzes/units/exams.
  return "quiz";
}

/**
 * Map list_todos catalog id → paper tid (mocTermDto contentId / test.id).
 * Unit/quiz/homework/exam catalog ids are NOT the paper tid the RPC expects.
 */
export function resolvePaperTarget(
  parsed: ParsedTodoId,
  moc: Record<string, unknown>,
  override?: PaperType,
): PaperTarget {
  const want = parsed.content_id;
  const paperType = resolvePaperType(parsed, override);

  if (parsed.source === "unit") {
    return catalogToTarget({
      found: findLegacyQuizUnit(moc, want),
      want,
      label: "单元测验",
      idKey: "unit_id",
      paper_type: paperType,
    });
  }

  if (parsed.source === "homework") {
    return catalogToTarget({
      found: findChapterHomework(moc, want),
      want,
      label: "作业",
      idKey: "homework_id",
      paper_type: override ?? "homework",
    });
  }

  if (parsed.source === "quiz") {
    const quiz = findChapterQuiz(moc, want);
    if (quiz != null) {
      return catalogToTarget({
        found: quiz,
        want,
        label: "章节测验",
        idKey: "quiz_id",
        paper_type: paperType,
      });
    }
    // list_todos historically used quiz source; also accept homework catalog ids.
    const hw = findChapterHomework(moc, want);
    if (hw != null) {
      return catalogToTarget({
        found: hw,
        want,
        label: "作业",
        idKey: "quiz_id",
        paper_type: override ?? "homework",
      });
    }
    return notFoundTarget(`未在学期目录中找到测验/作业 quiz_id=${want}`);
  }

  return catalogToTarget({
    found: findExam(moc, want),
    want,
    label: "考试",
    idKey: "exam_id",
    paper_type: paperType,
  });
}

function catalogToTarget(input: {
  found: CatalogPaper | null;
  want: string;
  label: string;
  idKey: string;
  paper_type: PaperType;
}): PaperTarget {
  if (input.found == null) {
    return notFoundTarget(
      `未在学期目录中找到${input.label} ${input.idKey}=${input.want}`,
    );
  }
  if (input.found.content_id == null) {
    return {
      ok: false,
      status: "unsupported",
      errors: [
        {
          where: "paper",
          message: `${input.label} ${input.want} 缺少 contentId，无法读卷`,
        },
      ],
    };
  }
  return {
    ok: true,
    tid: input.found.content_id,
    paper_type: input.paper_type,
    catalog_id: input.want,
    title: input.found.name,
  };
}

function notFoundTarget(message: string): PaperTargetFail {
  return {
    ok: false,
    status: "not_found",
    errors: [{ where: "todo_id", message }],
  };
}

type CatalogPaper = {
  name: string | null;
  content_id: string | null;
};

function paperFromRecord(
  record: Record<string, unknown>,
  test: Record<string, unknown> | null,
  nameFallback: string | null = null,
): CatalogPaper {
  return {
    name:
      asNonEmptyString(record.name) ??
      asNonEmptyString(record.title) ??
      asNonEmptyString(test?.name) ??
      nameFallback,
    // Never fall back to catalog record.id — that is not the paper tid.
    content_id: asId(record.contentId) ?? asId(test?.id),
  };
}

function findLegacyQuizUnit(
  moc: Record<string, unknown>,
  unitId: string,
): CatalogPaper | null {
  for (const chapterRaw of asArray(moc.chapters)) {
    const chapter = asRecord(chapterRaw);
    if (chapter == null) continue;
    for (const lessonRaw of asArray(chapter.lessons)) {
      const lesson = asRecord(lessonRaw);
      if (lesson == null) continue;
      for (const unitRaw of asArray(lesson.units)) {
        const unit = asRecord(unitRaw);
        if (unit == null) continue;
        if (asId(unit.id) !== unitId) continue;
        if (asFiniteNumber(unit.contentType) !== 5) {
          return null;
        }
        return {
          name: asNonEmptyString(unit.name),
          content_id: asId(unit.contentId) ?? asId(asRecord(unit.test)?.id),
        };
      }
    }
  }
  return null;
}

function findChapterQuiz(
  moc: Record<string, unknown>,
  quizId: string,
): CatalogPaper | null {
  for (const chapterRaw of asArray(moc.chapters)) {
    const chapter = asRecord(chapterRaw);
    if (chapter == null) continue;
    for (const quizRaw of asArray(chapter.quizs)) {
      const quiz = asRecord(quizRaw);
      if (quiz == null || asId(quiz.id) !== quizId) continue;
      return paperFromRecord(quiz, asRecord(quiz.test));
    }
  }
  return null;
}

function findChapterHomework(
  moc: Record<string, unknown>,
  homeworkId: string,
): CatalogPaper | null {
  for (const chapterRaw of asArray(moc.chapters)) {
    const chapter = asRecord(chapterRaw);
    if (chapter == null) continue;
    for (const hwRaw of asArray(chapter.homeworks)) {
      const hw = asRecord(hwRaw);
      if (hw == null || asId(hw.id) !== homeworkId) continue;
      return paperFromRecord(hw, asRecord(hw.test));
    }
  }
  return null;
}

function findExam(
  moc: Record<string, unknown>,
  examId: string,
): CatalogPaper | null {
  for (const examRaw of asArray(moc.exams)) {
    const exam = asRecord(examRaw);
    if (exam == null || asId(exam.id) !== examId) continue;
    return paperFromRecord(exam, asRecord(exam.test));
  }
  return null;
}

