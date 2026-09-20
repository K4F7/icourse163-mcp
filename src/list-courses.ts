import { missingSessionFailure } from "./auth";
import {
  fetchAllCoursePanels,
  resolveSession,
  type ToolError,
} from "./course-rpc";
import type { Icourse163Ports } from "./ports";

export type ListCoursesStatus = "ok" | "auth_expired" | "error";

export type CourseItem = {
  id: string;
  name: string;
  school: string;
  type: "mooc" | "spoc";
  term_id: string;
};

export type ListCoursesResult = {
  isError: boolean;
  status: ListCoursesStatus;
  courses: CourseItem[];
  errors: ToolError[];
};

export async function listCourses(
  ports?: Icourse163Ports,
): Promise<ListCoursesResult> {
  if (ports == null) {
    return {
      isError: true,
      status: "auth_expired",
      courses: [],
      errors: [{ where: "credentials", message: missingSessionFailure().message }],
    };
  }

  const session = await resolveSession(ports);
  if (!session.ok) {
    return {
      isError: true,
      status: session.status,
      courses: [],
      errors: session.errors,
    };
  }

  const panels = await fetchAllCoursePanels({
    http: ports.http,
    cookie: session.cookie,
    csrfKey: session.csrfKey,
  });
  if (!panels.ok) {
    return {
      isError: true,
      status: panels.status,
      courses: [],
      errors: panels.errors,
    };
  }

  return {
    isError: false,
    status: "ok",
    courses: panels.courses.map((course) => ({
      id: course.course_id,
      name: course.name,
      school: course.school_short_name,
      type: course.type,
      term_id: course.term_id,
    })),
    errors: [],
  };
}
