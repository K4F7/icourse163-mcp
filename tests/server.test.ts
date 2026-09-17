import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createIcourse163McpServer } from "../src/server";

describe("icourse163 MCP server", () => {
  test("registers list_todos and returns a not_implemented error stub", async () => {
    const server = createIcourse163McpServer();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((tool) => tool.name === "list_todos"),
        true,
        "server must register list_todos",
      );

      const result = await client.callTool({ name: "list_todos", arguments: {} });
      assert.equal("isError" in result && result.isError, true);

      const payload = structuredPayload(result);
      assert.equal(payload.status, "not_implemented");
      assert.notEqual(payload.status, "ok");
      assert.deepEqual(payload.todos, []);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function structuredPayload(result: unknown): { status: string; todos: unknown } {
  assert.ok(result !== null && typeof result === "object");
  const record = result as Record<string, unknown>;

  if (
    record.structuredContent !== null &&
    typeof record.structuredContent === "object" &&
    record.structuredContent !== undefined &&
    "status" in record.structuredContent
  ) {
    return record.structuredContent as { status: string; todos: unknown };
  }

  assert.ok(Array.isArray(record.content) && record.content.length > 0);
  const first = record.content[0];
  assert.ok(first !== null && typeof first === "object");
  const item = first as { type?: unknown; text?: unknown };
  assert.equal(item.type, "text");
  const text = item.text;
  assert.equal(typeof text, "string");
  return JSON.parse(text as string) as { status: string; todos: unknown };
}
