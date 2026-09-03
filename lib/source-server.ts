import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny local HTTP server the runner fully controls, so probes can change what a
 * key "means" between two reads without touching anything about the server under
 * test. Each key is a path; `GET /<key>` returns `{"rows": [...]}` — zero rows for
 * absence, one for a single answer, several for agreement or disagreement — or a
 * non-200 status while the key is marked "down", for the unreachable probe.
 *
 * This process must be reachable from the server under test. For a server running
 * on this machine, the default loopback URL is fine. For a remote server, pass
 * `--source-url` pointing at a tunnel (cloudflared, ngrok, …) that forwards to this
 * port, and the runner will hand out URLs built from that base instead.
 */
export class ControllableSource {
  private rows = new Map<string, unknown[]>();
  private downKeys = new Set<string>();
  private server: http.Server;
  private listenPort: number;
  private publicBase: string | undefined;

  constructor(private requestedPort: number, publicBaseUrl: string | undefined) {
    this.listenPort = requestedPort;
    this.publicBase = publicBaseUrl?.replace(/\/+$/, "");
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.requestedPort, "127.0.0.1", () => resolve());
    });
    const addr = this.server.address() as AddressInfo;
    this.listenPort = addr.port;
    if (!this.publicBase) this.publicBase = `http://127.0.0.1:${this.listenPort}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  get port(): number {
    return this.listenPort;
  }

  get baseUrl(): string {
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

  urlFor(key: string, rows: unknown[]): string {
    this.setRows(key, rows);
    return `${this.baseUrl}/${encodeURIComponent(key)}`;
  }

  setRows(key: string, rows: unknown[]): void {
    this.rows.set(key, rows);
  }

  down(key: string): void {
    this.downKeys.add(key);
  }

  up(key: string): void {
    this.downKeys.delete(key);
  }
}
