import http from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

/**
 * Bootstraps a minimal MCP-over-Streamable-HTTP server around three tool handlers,
 * for the red/green test fixtures only. Not part of the public suite — it exists so
 * `conformance.test.ts` has something concrete to run the suite against.
 */
export interface FakeServerBehavior {
  bind: (input: { key: string; url: string }) => Promise<unknown> | unknown;
  recall: (input: { key: string; [extra: string]: unknown }) => Promise<unknown> | unknown;
  act: (input: { key: string; kind: string }) => Promise<unknown> | unknown;
}

export interface StartedFakeServer {
  url: string;
  close: () => Promise<void>;
}

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    key: { type: "string" },
    url: { type: "string" },
    kind: { type: "string" },
  },
  // Deliberately no `required`/`additionalProperties: false` restriction beyond
  // `key` on read — the confidence-hint probe needs the schema to accept an extra
  // property, and a fixture that rejected it would only test the SKIP path.
  required: ["key"],
};

function toolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function buildServer(name: string, behavior: FakeServerBehavior): Server {
  const mcpServer = new Server({ name, version: "0.0.1" }, { capabilities: { tools: {} } });

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "recall_live_fact", description: "test fixture", inputSchema: TOOL_SCHEMA },
      { name: "commit_gated_action", description: "test fixture", inputSchema: TOOL_SCHEMA },
      { name: "bind_source", description: "test fixture", inputSchema: TOOL_SCHEMA },
    ],
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    if (req.params.name === "recall_live_fact") {
      return toolResult(await behavior.recall(args as { key: string }));
    }
    if (req.params.name === "commit_gated_action") {
      return toolResult(await behavior.act(args as { key: string; kind: string }));
    }
    if (req.params.name === "bind_source") {
      return toolResult(await behavior.bind(args as { key: string; url: string }));
    }
    return { isError: true, content: [{ type: "text" as const, text: `unknown tool ${req.params.name}` }] };
  });

  return mcpServer;
}

export async function startFakeServer(name: string, behavior: FakeServerBehavior): Promise<StartedFakeServer> {
  // Stateless-per-request, per the SDK's own stateless example: a fresh low-level
  // Server + transport for each POST, session management disabled. `behavior`
  // closes over state that lives OUTSIDE any of this (the fixture's bindings/rows),
  // so statelessness here costs nothing.
  const httpServer = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const mcpServer = buildServer(name, behavior);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${addr.port}/mcp`,
    close: () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  };
}
