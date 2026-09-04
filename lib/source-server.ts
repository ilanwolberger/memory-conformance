import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny controllable source, so probes can change what a key "means" between two
 * reads without touching anything about the server under test. Each key is a path;
 * `GET /<key>` returns `{"rows": [...]}` — zero rows for absence, one for a single
 * answer, several for agreement or disagreement — or a non-200 status while the key
 * is marked "down", for the unreachable probe.
 *
 * Two ways to host it:
 *  - LOCAL (default): this process runs a small HTTP server on this machine. For a
 *    server under test running on this machine, the default loopback URL is fine.
 *    For a remote server, pass `--source-url` pointing at a tunnel (cloudflared,
 *    ngrok, …) that forwards to this port, and the runner hands out URLs built from
 *    that base instead.
 *  - REMOTE (`--remote-source <base>`): a source already hosted next to the server
 *    under test (e.g. deployed alongside it) serves the GETs; this class never
 *    listens locally and instead PUTs `{rows}` / `{down:true}` to `<base>/<key>` to
 *    mutate what that remote source reports. Use this when the server under test
 *    cannot reach back to this machine at all, even through a tunnel. Every method
 *    below is async either way so callers don't need to know which mode is active.
 */
export class ControllableSource {
  private rows = new Map<string, unknown[]>();
  private downKeys = new Set<string>();
  private server: http.Server;
  private listenPort: number;
  private publicBase: string | undefined;
  private remoteBase: string | undefined;

  constructor(private requestedPort: number, publicBaseUrl: string | undefined, remoteBase?: string) {
    this.listenPort = requestedPort;
    this.publicBase = publicBaseUrl?.replace(/\/+$/, "");
    this.remoteBase = remoteBase?.replace(/\/+$/, "");
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<void> {
    if (this.remoteBase) return; // pod-hosted source: nothing to listen on locally
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.requestedPort, "127.0.0.1", () => resolve());
    });
    const addr = this.server.address() as AddressInfo;
    this.listenPort = addr.port;
    if (!this.publicBase) this.publicBase = `http://127.0.0.1:${this.listenPort}`;
  }

  async stop(): Promise<void> {
    if (this.remoteBase) return;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  get port(): number {
    return this.listenPort;
  }

  get baseUrl(): string {
    if (this.remoteBase) return this.remoteBase;
    if (!this.publicBase) throw new Error("ControllableSource: start() has not run yet");
    return this.publicBase;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const key = decodeURIComponent((req.url ?? "/").replace(/^\/+/, ""));
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (this.downKeys.has(key)) {
      res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "source_unreachable" }));
      return;
    }
    const rows = this.rows.get(key) ?? [];
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ rows }));
  }

  /** Build the URL that, once bound, serves `rows` for `key`. Registers the rows as
   *  a side effect — in remote mode this means the PUT to the remote source has
   *  already completed by the time this resolves, so a caller's very next `bind`
   *  can never race ahead of it. */
  async urlFor(key: string, rows: unknown[]): Promise<string> {
    await this.setRows(key, rows);
    return `${this.baseUrl}/${encodeURIComponent(key)}`;
  }

  async setRows(key: string, rows: unknown[]): Promise<void> {
    this.rows.set(key, rows);
    this.downKeys.delete(key);
    if (this.remoteBase) await this.putRemote(key, { rows });
  }

  async down(key: string): Promise<void> {
    this.downKeys.add(key);
    if (this.remoteBase) await this.putRemote(key, { down: true });
  }

  async up(key: string): Promise<void> {
    this.downKeys.delete(key);
    if (this.remoteBase) await this.putRemote(key, { rows: this.rows.get(key) ?? [] });
  }

  private async putRemote(key: string, body: { rows: unknown[] } | { down: true }): Promise<void> {
    const res = await fetch(`${this.remoteBase}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`remote source PUT ${key} -> ${res.status}: ${await res.text().catch(() => "")}`);
    }
  }
}
