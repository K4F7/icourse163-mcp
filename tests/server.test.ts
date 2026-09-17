import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { COURSE_LIST_RPC_URL, WARMUP_URL } from "../src/auth";
import type { Icourse163Http, ListTodosPorts } from "../src/list-todos";
import { createIcourse163McpServer } from "../src/server";
import { EMPTY_COURSE_PANEL_BODY } from "./fixtures";

describe("icourse163 MCP server", () => {
  test("registers list_todos and returns auth_expired without a session", async () => {
    const server = createIcourse163McpServer({
      credentials: { getCookie: async () => null },
      http: {
        async request() {
          throw new Error("http should not run");
        },
      },
    });
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
      assert.equal(payload.status, "auth_expired");
      assert.notEqual(payload.status, "ok");
      assert.notEqual(payload.status, "not_implemented");
      assert.deepEqual(payload.todos, []);
      assert.equal("cookie" in payload, false);
      assert.equal(JSON.stringify(payload).includes("test-session"), false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("returns ok and empty todos when mock ports have no open items", async () => {
    const http: Icourse163Http = {
      async request(input) {
        if (input.url === WARMUP_URL) {
          return {
            statusCode: 200,
            url: input.url,
            body: "<html>ok</html>",
            cookie: `${input.cookie}; STUDY_INFO=ok`,
          };
        }
        if (input.url.startsWith(COURSE_LIST_RPC_URL)) {
          return {
            statusCode: 200,
            url: input.url,
            body: EMPTY_COURSE_PANEL_BODY,
            cookie: input.cookie,
          };
        }
        throw new Error(`unexpected url ${input.url}`);
      },
    };
    const ports: ListTodosPorts = {
      credentials: { getCookie: async () => "NTESSTUDYSI=test-session" },
      http,
    };
    const server = createIcourse163McpServer(ports);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
      const result = await client.callTool({ name: "list_todos", arguments: {} });
      assert.equal("isError" in result && result.isError, false);
      const payload = structuredPayload(result);
      assert.equal(payload.status, "ok");
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
