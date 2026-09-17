import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listTodos } from "./list-todos";

const LIST_TODOS_DESCRIPTION = [
  "List still-open 待办 from 中国大学MOOC (icourse163.org).",
  "status ok with an empty todos list means none are still open.",
  "认证失效 (auth_expired) and other failures are errors (isError), never a successful empty list.",
  "Do not pass accounts or cookies; this tool never returns them.",
].join(" ");

export function createIcourse163McpServer(): McpServer {
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
      const result = listTodos();
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: { ...result },
        isError: result.isError,
      };
    },
  );

  return server;
}
