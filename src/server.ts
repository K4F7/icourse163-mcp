import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listTodos, type ListTodosPorts } from "./list-todos";

const LIST_TODOS_DESCRIPTION = [
  "List still-open 待办 from 中国大学MOOC (icourse163.org): 未完成 / 未交 / 可作答 homework, quizzes, and exams.",
  "Each item has id, title, course_title, due_at (ISO+08:00 or null), and kind (作业/测验/考试).",
  "status ok with an empty todos list means none are still open.",
  "认证失效 (auth_expired) and other failures are errors (isError), never a successful empty list.",
  "Do not pass accounts or cookies; this tool never returns them.",
  "Log in with the CLI (`npm run login`); MCP never accepts passwords.",
].join(" ");

export function createIcourse163McpServer(ports?: ListTodosPorts): McpServer {
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

  return server;
}
