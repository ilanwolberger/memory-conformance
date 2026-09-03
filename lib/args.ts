export interface RunArgs {
  url: string;
  headers: Record<string, string>;
  readTool: string;
  actTool: string;
  bindTool: string;
  sourceUrl: string | undefined;
  sourcePort: number;
  stateMapSpec: string | undefined;
  json: boolean;
  only: string[] | undefined;
  timeoutMs: number;
}

const DEFAULTS = {
  readTool: "recall_live_fact",
  actTool: "commit_gated_action",
  bindTool: "bind_source",
  sourcePort: 0,
  timeoutMs: 10_000,
};

export function parseArgs(argv: string[]): RunArgs {
  const headers: Record<string, string> = {};
  let url: string | undefined;
  let readTool = DEFAULTS.readTool;
  let actTool = DEFAULTS.actTool;
  let bindTool = DEFAULTS.bindTool;
  let sourceUrl: string | undefined;
  let sourcePort = DEFAULTS.sourcePort;
  let stateMapSpec: string | undefined;
  let json = false;
  let only: string[] | undefined;
  let timeoutMs = DEFAULTS.timeoutMs;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--url":
        url = next();
        break;
      case "--header": {
        const raw = next();
        const idx = raw?.indexOf(":") ?? -1;
        if (raw && idx > 0) headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
        break;
      }
      case "--read-tool":
        readTool = next() ?? readTool;
        break;
      case "--act-tool":
        actTool = next() ?? actTool;
        break;
      case "--bind-tool":
        bindTool = next() ?? bindTool;
        break;
      case "--source-url":
        sourceUrl = next();
        break;
      case "--source-port":
        sourcePort = Number(next());
        break;
      case "--state-map":
        stateMapSpec = next();
        break;
      case "--only":
        only = (next() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--timeout":
        timeoutMs = Number(next());
        break;
      case "--json":
        json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        // Unknown flag — ignore rather than crash a run over a typo'd extra.
        break;
    }
  }

  if (!url) {
    printHelp();
    throw new Error("--url is required");
  }

  return { url, headers, readTool, actTool, bindTool, sourceUrl, sourcePort, stateMapSpec, json, only, timeoutMs };
}

export function printHelp(): void {
  console.error(`
memory-conformance — behavioral conformance suite for MCP memory servers

Usage:
  npx tsx run.ts --url <mcp endpoint> [options]

Options:
  --url <url>            MCP Streamable HTTP endpoint to test (required)
  --header "Name: value"  Extra request header; repeatable
  --read-tool <name>      Live-read tool name (default: recall_live_fact)
  --act-tool <name>       Gated-act tool name (default: commit_gated_action)
  --bind-tool <name>      Source-bind tool name (default: bind_source)
  --source-url <url>      Public URL the target server can reach back to for this
                          run's local source (default: http://127.0.0.1:<port>).
                          For a remote target, point this at a tunnel forwarding to
                          the local source port (e.g. cloudflared, ngrok).
  --source-port <port>    Port for the local source server (default: random free port)
  --state-map <spec>      Remap the read result's state field/values, e.g.
                          "field=status,resolved=ok,ambiguous=conflict,unavailable=missing"
  --only <names>          Comma-separated probe names to run (default: all)
  --timeout <ms>          Per-call timeout (default: 10000)
  --json                  Print machine-readable JSON instead of the table
`);
}
