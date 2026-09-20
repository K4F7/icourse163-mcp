import { missingSessionFailure } from "./auth";
import {
  fetchMocTermDto,
  learnReferer,
  resolveSession,
  type ToolError,
} from "./course-rpc";
import {
  asArray,
  asFiniteNumber,
  asId,
  asNonEmptyString,
  asRecord,
  parseJsonObject,
} from "./json-util";
import { mapContentType, type UnitType } from "./list-term-units";
import type { Icourse163Http, Icourse163Ports } from "./ports";

export const SAVE_LEARN_RPC_PATH = "/web/j/courseBean.saveMocContentLearn.rpc";
export const SAVE_LEARN_RPC_URL = `https://www.icourse163.org${SAVE_LEARN_RPC_PATH}`;

export const LEARN_VO_RPC_PATH = "/web/j/courseBean.getLessonUnitLearnVo.rpc";
export const LEARN_VO_RPC_URL = `https://www.icourse163.org${LEARN_VO_RPC_PATH}`;

const ORIGIN = "https://www.icourse163.org";
const DEFAULT_PLAYBACK_RATE = 1;
const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

export type StudyUnitStatus =
  | "ok"
  | "auth_expired"
  | "non_media_unit"
  | "page_structure_change"
  | "error";

export type StudyUnitArgs = {
  course_id: string;
  term_id: string;
  unit_id: string;
  school_short_name?: string;
  playback_rate?: number;
};

export type StudyUnitResult = {
  isError: boolean;
  status: StudyUnitStatus;
  course_id: string;
  term_id: string;
  unit_id: string;
  unit_type: UnitType | null;
  completed: boolean;
  learned_sec: number | null;
  duration_sec: number | null;
  percent: number | null;
  playback_rate: number;
  transport: "rpc" | null;
  errors: ToolError[];
};

export type LocatedUnit = {
  unit_id: string;
  name: string;
  content_type: number | null;
  unit_type: UnitType;
  content_id: string | null;
  duration_sec: number | null;
  lesson_id: string | null;
};

export type VideoLearnDto = {
  unitId: number;
  contentType: number;
  finished: boolean;
  videoDto: {
    videoId: number;
    duration: number;
    currentTime: number;
    learnedTime: number;
  };
};

export function clampPlaybackRate(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_PLAYBACK_RATE;
  }
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, value));
}

export function findUnitInMocTerm(
  moc: Record<string, unknown>,
  unitId: string,
): LocatedUnit | null {
  const want = unitId.trim();
  if (want.length === 0) {
    return null;
  }
  for (const chapterRaw of asArray(moc.chapters)) {
    const chapter = asRecord(chapterRaw);
    if (chapter == null) {
      continue;
    }
    for (const lessonRaw of asArray(chapter.lessons)) {
      const lesson = asRecord(lessonRaw);
      if (lesson == null) {
        continue;
      }
      const lessonId = asId(lesson.id);
      for (const unitRaw of asArray(lesson.units)) {
        const unit = asRecord(unitRaw);
        if (unit == null) {
          continue;
        }
        const id = asId(unit.id);
        if (id == null || id !== want) {
          continue;
        }
        const contentType = asFiniteNumber(unit.contentType);
        return {
          unit_id: id,
          name: asNonEmptyString(unit.name) ?? "未命名单元",
          content_type: contentType,
          unit_type: mapContentType(contentType),
          content_id:
            asId(unit.contentId) ?? asId(unit.videoId) ?? asId(unit.resourceId),
          duration_sec: firstPositiveDuration(unit),
          lesson_id: lessonId,
        };
      }
    }
  }
  return null;
}

export function buildVideoLearnDto(input: {
  unit_id: string;
  content_id: string;
  duration_sec: number;
}): VideoLearnDto {
  const duration = Math.max(0, Math.floor(input.duration_sec));
  return {
    unitId: Number(input.unit_id),
    contentType: 1,
    finished: true,
    videoDto: {
      videoId: Number(input.content_id),
      duration,
      currentTime: duration,
      learnedTime: duration,
    },
  };
}

export async function studyUnit(
  args: StudyUnitArgs,
  ports?: Icourse163Ports,
): Promise<StudyUnitResult> {
  const courseId = args.course_id.trim();
  const termId = args.term_id.trim();
  const unitId = args.unit_id.trim();
  const playbackRate = clampPlaybackRate(args.playback_rate);
  const base = emptyResult(courseId, termId, unitId, playbackRate);

  if (courseId.length === 0 || termId.length === 0 || unitId.length === 0) {
    return {
      ...base,
      isError: true,
      status: "error",
      errors: [
        {
          where: "args",
          message: "course_id, term_id, and unit_id are required",
        },
      ],
    };
  }

  if (ports == null) {
    return {
      ...base,
      isError: true,
      status: "auth_expired",
      errors: [
        { where: "credentials", message: missingSessionFailure().message },
      ],
    };
  }

  const session = await resolveSession(ports);
  if (!session.ok) {
    return {
      ...base,
      isError: true,
      status: session.status,
      errors: session.errors,
    };
  }

  const course = {
    course_id: courseId,
    term_id: termId,
    school_short_name: (args.school_short_name ?? "").trim(),
  };

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
    return {
      ...base,
      isError: true,
      status: "error",
      errors: [{ where: "term", message: `Term structure RPC failed: ${detail}` }],
    };
  }

  if (moc == null) {
    return {
      ...base,
      isError: true,
      status: "page_structure_change",
      errors: [
        {
          where: "term",
          message:
            "Term structure RPC returned no mocTermDto (page/API structure may have changed)",
        },
      ],
    };
  }

  const located = findUnitInMocTerm(moc, unitId);
  if (located == null) {
    return {
      ...base,
      isError: true,
      status: "page_structure_change",
      errors: [
        {
          where: "unit",
          message: `Unit ${unitId} not found in term catalog (wrong id or page/API structure change)`,
        },
      ],
    };
  }

  if (located.unit_type !== "video") {
    return {
      ...base,
      isError: true,
      status: "non_media_unit",
      unit_type: located.unit_type,
      errors: [
        {
          where: "unit",
          message: `Unit ${unitId} is type ${located.unit_type}, not video/audio media`,
        },
      ],
    };
  }

  const referer = learnReferer(course);
  let durationSec = located.duration_sec;
  let contentId = located.content_id;

  const learnVo = await fetchLessonUnitLearnVo({
    http: ports.http,
    cookie: session.cookie,
    csrfKey: session.csrfKey,
    contentId: contentId ?? unitId,
    unitId,
    referer,
  });
  if (learnVo != null) {
    if (learnVo.durationSec != null) {
      durationSec = learnVo.durationSec;
    }
    if (learnVo.videoId != null) {
      contentId = learnVo.videoId;
    }
  }

  if (contentId == null || durationSec == null) {
    return {
      ...base,
      isError: true,
      status: "page_structure_change",
      unit_type: "video",
      errors: [
        {
          where: "learn_vo",
          message:
            "Could not resolve video contentId/duration (page/API structure may have changed)",
        },
      ],
    };
  }

  const dto = buildVideoLearnDto({
    unit_id: unitId,
    content_id: contentId,
    duration_sec: durationSec,
  });

  let saveBody: string;
  try {
    const response = await ports.http.request({
      url: `${SAVE_LEARN_RPC_URL}?csrfKey=${encodeURIComponent(session.csrfKey)}`,
      cookie: session.cookie,
      method: "POST",
      form: { dto: JSON.stringify(dto) },
      headers: {
        origin: ORIGIN,
        referer,
      },
    });
    if (response.statusCode === 401 || response.statusCode === 403) {
      return {
        ...base,
        isError: true,
        status: "auth_expired",
        unit_type: "video",
        errors: [
          {
            where: "credentials",
            message:
              "icourse163 session is missing or expired (auth_expired). Run `npm run login` again.",
          },
        ],
      };
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        ...base,
        isError: true,
        status: "error",
        unit_type: "video",
        errors: [
          {
            where: "save_learn",
            message: `saveMocContentLearn HTTP ${response.statusCode}`,
          },
        ],
      };
    }
    saveBody = response.body;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      isError: true,
      status: "error",
      unit_type: "video",
      errors: [{ where: "save_learn", message: detail }],
    };
  }

  const saveJson = parseJsonObject(saveBody);
  if (saveJson == null) {
    return {
      ...base,
      isError: true,
      status: "page_structure_change",
      unit_type: "video",
      errors: [
        {
          where: "save_learn",
          message:
            "saveMocContentLearn returned non-JSON (page/API structure may have changed)",
        },
      ],
    };
  }
  if (saveJson.code !== 0) {
    return {
      ...base,
      isError: true,
      status: "error",
      unit_type: "video",
      errors: [
        {
          where: "save_learn",
          message: `saveMocContentLearn code=${String(saveJson.code)} ${asNonEmptyString(saveJson.message) ?? ""}`.trim(),
        },
      ],
    };
  }

  return {
    isError: false,
    status: "ok",
    course_id: courseId,
    term_id: termId,
    unit_id: unitId,
    unit_type: "video",
    completed: true,
    learned_sec: durationSec,
    duration_sec: durationSec,
    percent: 100,
    playback_rate: playbackRate,
    transport: "rpc",
    errors: [],
  };
}

function emptyResult(
  courseId: string,
  termId: string,
  unitId: string,
  playbackRate: number,
): Omit<StudyUnitResult, "isError" | "status" | "errors"> {
  return {
    course_id: courseId,
    term_id: termId,
    unit_id: unitId,
    unit_type: null,
    completed: false,
    learned_sec: null,
    duration_sec: null,
    percent: null,
    playback_rate: playbackRate,
    transport: null,
  };
}

function firstPositiveDuration(unit: Record<string, unknown>): number | null {
  const raw = firstNumber(
    unit.duration,
    unit.videoTime,
    unit.videoSeconds,
    unit.length,
    unit.timeLength,
  );
  if (raw == null || raw <= 0) {
    return null;
  }
  if (raw > 10_000) {
    return Math.floor(raw / 1000);
  }
  return Math.floor(raw);
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

async function fetchLessonUnitLearnVo(input: {
  http: Icourse163Http;
  cookie: string;
  csrfKey: string;
  contentId: string;
  unitId: string;
  referer: string;
}): Promise<{ durationSec: number | null; videoId: string | null } | null> {
  try {
    const response = await input.http.request({
      url: `${LEARN_VO_RPC_URL}?csrfKey=${encodeURIComponent(input.csrfKey)}`,
      cookie: input.cookie,
      method: "POST",
      form: {
        contentId: input.contentId,
        unitId: input.unitId,
        contentType: "1",
      },
      headers: {
        origin: ORIGIN,
        referer: input.referer,
      },
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return null;
    }
    const json = parseJsonObject(response.body);
    if (json == null || json.code !== 0) {
      return null;
    }
    const result = asRecord(json.result) ?? json;
    return {
      durationSec: firstPositiveDuration(result),
      videoId: asId(result.videoId) ?? asId(result.contentId) ?? asId(result.id),
    };
  } catch {
    return null;
  }
}
