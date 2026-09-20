import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { listCourses } from "./list-courses";
import { listTermUnits } from "./list-term-units";
import { listTodos } from "./list-todos";
import type { Icourse163Ports } from "./ports";

const LIST_TODOS_DESCRIPTION = [
  "List still-open 待办 from 中国大学MOOC (icourse163.org): 未完成 / 未交 / 可作答 homework, quizzes, and exams.",
  "Each item has id, title, course_title, due_at (ISO+08:00 or null), and kind (作业/测验/考试).",
  "status ok with an empty todos list means none are still open.",
  "认证失效 (auth_expired) and other failures are errors (isError), never a successful empty list.",
  "Do not pass accounts or cookies; this tool never returns them.",
  "Log in with the CLI (`npm run login`); MCP never accepts passwords.",
].join(" ");

const LIST_COURSES_DESCRIPTION = [
  "List enrolled 中国大学MOOC courses (MOOC + SPOC).",
  "Each course has id, name, school, type (mooc|spoc), and term_id.",
  "status ok with an empty courses list means none enrolled.",
  "认证失效 (auth_expired) and other failures are errors (isError).",
  "Do not pass accounts or cookies; this tool never returns them.",
  "Log in with the CLI (`npm run login`); MCP never accepts passwords.",
].join(" ");

const LIST_TERM_UNITS_DESCRIPTION = [
  "List the lesson → unit catalog for one enrolled course term (课件目录).",
  "Args: course_id, term_id, optional school_short_name (for Referer).",
  "Each unit has id, name, type (video|doc|quiz|other), and learn_status when available.",
  "Chapter quizzes appear as quiz lessons. Auth failures are auth_expired (isError).",
  "Do not pass accounts or cookies; this tool never returns them.",
  "Log in with the CLI (`npm run login`); MCP never accepts passwords.",
].join(" ");

export function createIcourse163McpServer(ports?: Icourse163Ports): McpServer {
  const server = new McpServer({
    name: "icourse163-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "list_todos",
    {
      title: "List 待办",
      description: LIST_TODOS_DESCRIPTION,
    },
    async () => {
      const result = await listTodos(ports);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: { ...result },
        isError: result.isError,
      };
    },
  );

  server.registerTool(
    "list_courses",
    {
      title: "List 已选课程",
      description: LIST_COURSES_DESCRIPTION,
    },
    async () => {
      const result = await listCourses(ports);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: { ...result },
        isError: result.isError,
      };
    },
  );

  server.registerTool(
    "list_term_units",
    {
      title: "List 课件目录",
      description: LIST_TERM_UNITS_DESCRIPTION,
      inputSchema: {
        course_id: z.string().describe("Course id from list_courses"),
        term_id: z.string().describe("Term id from list_courses"),
        school_short_name: z
          .string()
          .optional()
          .describe("Optional school shortName for learn Referer (e.g. SJTU)"),
      },
    },
    async (args) => {
      const result = await listTermUnits(
        {
          course_id: args.course_id,
          term_id: args.term_id,
          school_short_name: args.school_short_name,
        },
        ports,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: { ...result },
        isError: result.isError,
      };
    },
  );

  return server;
}
