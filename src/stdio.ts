import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createLocalCredentialStore } from "./credentials";
import { createFetchIcourse163Http } from "./http";
import type { ListTodosPorts } from "./list-todos";
import { createIcourse163McpServer } from "./server";

function localStdioPorts(): ListTodosPorts {
  return {
    credentials: createLocalCredentialStore(),
    http: createFetchIcourse163Http(),
  };
}

async function main(): Promise<void> {
  const server = createIcourse163McpServer(localStdioPorts());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
