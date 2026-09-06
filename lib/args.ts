export interface RunArgs {
  url: string;
  headers: Record<string, string>;
  readTool: string;
  actTool: string;
  bindTool: string;
  sourceUrl: string | undefined;
  sourcePort: number;
  remoteSource: string | undefined;
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

/**
 * `env` defaults to `process.env` and exists as a parameter purely so
 * tests/args-header-env.test.ts can inject a fake one offline — `--header-env`
 * itself always resolves against the real process environment in a real run.
 */
export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): RunArgs {
  const headers: Record<string, string> = {};
  let url: string | undefined;
  let readTool = DEFAULTS.readTool;
  let actTool = DEFAULTS.actTool;
  let bindTool = DEFAULTS.bindTool;
  let sourceUrl: string | undefined;
  let sourcePort = DEFAULTS.sourcePort;
  let remoteSource: string | undefined;
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
      case "--header-env": {
        // Same "Name: value" shape as --header, but the value is read from an
        // environment variable instead of argv — so a bearer token never shows
        // up in `ps`/shell history/a process-list snapshot the way a literal
        // --header "Authorization: Bearer <token>" does. Repeatable, same as
        // --header; the two can be mixed freely in one run.
        const varName = next();
        if (!varName) throw new Error("--header-env requires an environment variable name");
        const raw = env[varName];
        if (!raw) throw new Error(`--header-env ${varName}: environment variable is not set (or empty)`);
        const idx = raw.indexOf(":");
        if (idx <= 0) throw new Error(`--header-env ${varName}: value must look like "Name: value", got a value with no "Name:" prefix`);
        headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
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
      case "--remote-source":
        remoteSource = next();
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

  return { url, headers, readTool, actTool, bindTool, sourceUrl, sourcePort, remoteSource, stateMapSpec, json, only, timeoutMs };
}

export function printHelp(): void {
  console.error(`
memory-conformance — behavioral conformance suite for MCP memory servers

Usage:
  npx tsx run.ts --url <mcp endpoint> [options]

Options:
  --url <url>            MCP Streamable HTTP endpoint to test (required)
  --header "Name: value"  Extra request header; repeatable
  --header-env <VAR_NAME>  Extra request header, same "Name: value" shape as
                          --header, but the value is read from environment
                          variable VAR_NAME instead of argv — so a secret (a
                          bearer token) never appears in a process listing or
                          shell history. Repeatable; freely mixable with --header.
  --read-tool <name>      Live-read tool name (default: recall_live_fact)
  --act-tool <name>       Gated-act tool name (default: commit_gated_action)
  --bind-tool <name>      Source-bind tool name (default: bind_source)
  --source-url <url>      Public URL the target server can reach back to for this
                          run's local source (default: http://127.0.0.1:<port>).
                          For a remote target, point this at a tunnel forwarding to
                          the local source port (e.g. cloudflared, ngrok).
  --source-port <port>    Port for the local source server (default: random free port)
  --remote-source <base>  Use a source already hosted next to the target server
                          instead of one on this machine — the runner PUTs
                          {rows}/{down:true} to "<base>/<key>" to mutate it, and the
                          target reads it at the same URL. Use this when the target
                          cannot reach back to this machine at all, even through a
                          tunnel (e.g. a hosted pod being tested from a laptop).
                          Overrides --source-url / --source-port.
  --state-map <spec>      Remap the read result's state field/values, e.g.
                          "field=status,resolved=ok,ambiguous=conflict,unavailable=missing"
  --only <names>          Comma-separated probe names to run (default: all)
  --timeout <ms>          Per-call timeout (default: 10000)
  --json                  Print machine-readable JSON instead of the table
`);
}
