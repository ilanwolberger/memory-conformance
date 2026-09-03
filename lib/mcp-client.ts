import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StateMap, NormalizedAct, NormalizedRead } from "./types.js";
import { normalizeAct, normalizeRead, type RawToolResult } from "./normalize.js";

export interface ToolNames {
  read: string;
  act: string;
  bind: string;
}

export interface ConnectedTarget {
  client: Client;
  hasReadTool: boolean;
  hasActTool: boolean;
  hasBindTool: boolean;
  readFact: (key: string, extra?: Record<string, unknown>) => Promise<NormalizedRead>;
  act: (key: string, kind: string) => Promise<NormalizedAct>;
  bind: (key: string, url: string) => Promise<{ ok: boolean; error?: string }>;
  close: () => Promise<void>;
}

export async function connectTarget(opts: {
  url: string;
  headers: Record<string, string>;
  toolNames: ToolNames;
  stateMap: StateMap;
}): Promise<ConnectedTarget> {
  const client = new Client({ name: "memory-conformance", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(opts.url), {
    requestInit: { headers: opts.headers },
  });
  await client.connect(transport);

  const listed = await client.listTools();
  const names = new Set(listed.tools.map((t) => t.name));
  const hasReadTool = names.has(opts.toolNames.read);
  const hasActTool = names.has(opts.toolNames.act);
  const hasBindTool = names.has(opts.toolNames.bind);

  async function callRaw(name: string, args: Record<string, unknown>): Promise<{ result?: RawToolResult; error?: unknown }> {
    try {
      const result = (await client.callTool({ name, arguments: args })) as RawToolResult;
      return { result };
    } catch (error) {
      return { error };
    }
  }

  return {
    client,
    hasReadTool,
    hasActTool,
    hasBindTool,
    async readFact(key, extra) {
      const { result, error } = await callRaw(opts.toolNames.read, { key, ...extra });
      return normalizeRead(result ?? {}, opts.stateMap, error);
    },
    async act(key, kind) {
      const { result, error } = await callRaw(opts.toolNames.act, { key, kind });
      return normalizeAct(result ?? {}, error);
    },
    async bind(key, url) {
      const { result, error } = await callRaw(opts.toolNames.bind, { key, url });
      if (error !== undefined) return { ok: false, error: error instanceof Error ? error.message : String(error) };
      if (result?.isError) {
        const text = (result.content ?? []).find((b) => b.type === "text")?.text;
        return { ok: false, error: text ?? "bind tool returned an error" };
      }
      return { ok: true };
    },
    async close() {
      await client.close();
    },
  };
}
