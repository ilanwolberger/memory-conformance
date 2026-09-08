# memory-conformance

A behavioral conformance suite for MCP memory servers. It connects to any server
that exposes an MCP tool for a live read, a gated action, and (optionally) binding
a key to a live source — and checks, from the outside, whether it behaves honestly.

It does not read a server's code, its prompts, or how it decides anything internally.
It only calls the server's tools over MCP and checks what comes back. **This suite
tests behavior, never mechanism** — every probe here is phrased as what a caller
must observe, not how a server should be built to produce it.

## Run it in three commands

```bash
git clone https://github.com/ilanwolberger/memory-conformance && cd memory-conformance
npm install
npx tsx run.ts --url https://your-server.example.com/mcp
```

Point `--url` at any MCP endpoint that speaks Streamable HTTP. If your tools use
different names than the defaults, tell the runner:

```bash
npx tsx run.ts \
  --url https://your-server.example.com/mcp \
  --header "Authorization: Bearer <token>" \
  --read-tool recall_live_fact \
  --act-tool commit_gated_action \
  --bind-tool bind_source
```

A bearer token in `--header` is visible to anything that can see this process's
argument list (a process listing, shell history) for as long as the run takes. Use
`--header-env VAR_NAME` instead to read the same "Name: value" header from an
environment variable — `--header-env OGEN_CONF_AUTH` with
`OGEN_CONF_AUTH="Authorization: Bearer <token>"` exported in the environment reads
identically to `--header "Authorization: Bearer <token>"`, without the token ever
appearing in argv. Repeatable, and freely mixable with `--header`.

If your server has no bind tool at all, the runner still works — every probe that
needs one just SKIPs, with the reason stated plainly.

Some probes need to change what a bound source says between two calls. The runner
starts a small local HTTP server for this and hands your server a URL to bind. If
your server runs on this machine, that just works. If your server runs remotely, it
needs to be able to reach back to this machine — point `--source-url` at a tunnel
(`cloudflared tunnel --url http://localhost:PORT`, `ngrok http PORT`, or similar)
forwarding to the port the runner prints:

```bash
npx tsx run.ts --url https://your-server.example.com/mcp \
  --source-port 8420 --source-url https://your-tunnel.example.com
```

Exit code is `1` if anything FAILs, `0` otherwise (SKIPs never fail the run) — safe
to wire into a CI step. Add `--json` for a machine-readable result instead of the
table.

For example, against Ogen's production endpoint. Ogen hosts a mutable test source for
the suite, so every probe runs there, none skip. Verified 2026-09-04: 12 of 12 passed.

```bash
TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
npx tsx run.ts \
  --url https://us.ogenhq.com/api/mcp \
  --header "Authorization: Bearer ogen_sk_..." \
  --remote-source "https://us.ogenhq.com/api/conf-source/$TOKEN"
```

`--remote-source <base>` tells the runner to keep its controllable source ON the server
under test instead of on this machine: the runner PUTs rows to `<base>/<key>`, the server
reads `<base>/<key>`. Any server can offer the same two-verb contract to be tested the same way.

## What "conformance" means here

A read tool call must return one of three honest states — resolved, ambiguous, or
unavailable — never a bare value with no indication of which. An action tool call
must only report itself as done when it actually ran; everything else, including a
held or drafted action, must say so plainly. Nothing here checks *how* a server
reaches those answers.

## The probes

| Probe | What must be true |
|---|---|
| `freshness` | Change what's behind a bound key, then read it again with no delay — the change must show up immediately. A cached answer fails this. |
| `ambiguity` | When a source disagrees with itself, the read must surface every candidate, not settle on one. |
| `agreement` | When a source agrees with itself, the read may resolve to that value — a sanity check that normal agreement still works. |
| `absence` | With nothing to read, the result must say so — it must not invent a value. |
| `unreachable` | When the source can't be reached, the result must say that — it must not fall back to a stale answer from before. |
| `confidence-hint` | Passing extra input that asserts certainty must not turn an ambiguous answer into a single value. Skips if the tool's schema rejects the extra input. |
| `act-under-ambiguity` | An action that depends on an ambiguous fact must not be reported as done. |
| `act-under-absence` | An action that depends on an absent fact must not be reported as done. |
| `act-when-resolved` | An action that depends on a resolved fact may run or may be held for a person — either is fine; this mostly checks the result is self-consistent, not that it necessarily fires. |
| `act-unknown-kind` | An action of a kind the server was never told about must not run. |
| `no-timer` | A source change must be visible on the very next read, with zero wait — a probe that would catch a poller with any lag at all. |
| `honest-shape` | Every read result must carry an explicit state in {resolved, ambiguous, unavailable} (or documented equivalents via `--state-map`) — never a bare value. |

## Reading a FAIL

Each result line names the probe, PASS/FAIL/SKIP, and one sentence saying exactly
what was expected and what came back instead. A FAIL means the server told a caller
something that wasn't true — it answered when it should have said it didn't know,
answered with one thing when its own source disagreed with itself, held an action's
result differently than it happened, or handed back stale data. A SKIP means the
suite couldn't test that property at all (usually: no bind tool, or the tool's
schema doesn't accept the extra input a probe needed) — it is not a pass.

## Against other memory servers

The suite only asks three things of a server: a keyed live read, a gated action, and
(optionally) a way to bind a key to a source. Most memory MCPs on the market today are
stores — they expose add/search/get tools over what was previously written, not a read
that goes to a live source at call time — so against them nearly every probe SKIPs, and
the runner says why on each line rather than awarding a pass.

Run 2026-09-08 against three of them, each with its read tool pointed at its search tool
and its act tool at its add tool:

| Server | Command shape | Result |
|---|---|---|
| `@modelcontextprotocol/server-memory` (reference, bridged to Streamable HTTP with `supergateway`) | `--read-tool search_nodes --act-tool create_entities` | 9 SKIP, 1 FAIL, 2 PASS |
| Mem0 hosted, `https://mcp.mem0.ai/mcp/` (trailing slash matters — the bare path 307s) | `--header-env <your Bearer token> --read-tool search_memories --act-tool add_memory` | 9 SKIP, 2 FAIL, 1 PASS |
| Supermemory hosted, `https://mcp.supermemory.ai/mcp` | `--header-env <your Bearer token> --read-tool search_memory --act-tool add_memory` | 9 SKIP, 1 FAIL, 2 PASS |

The nine SKIPs are the same on all three: no bind tool, so nothing can be put behind a key
and changed. `absence` FAILs on all three the same way: the search tool rejects a keyed
call rather than reporting the key unavailable. `act-under-absence` PASSes where the add
tool errors instead of running (reference, Supermemory) and FAILs where the result carries
no explicit committed/not-committed indication (Mem0). `honest-shape` PASSes on all three
only because no read could be completed to check.

None of this is a defect in those servers — they were not built to make the promise this
suite checks. It is a way to tell, from the outside, which servers make it.

## Prove it to yourself

`npm test` runs the suite against two fixtures built for exactly this: one that gets
everything right, and one built with known defects — it caches instead of re-reading,
it picks a candidate instead of surfacing disagreement, it invents a value instead of
admitting absence, and it commits actions regardless of whether the fact behind them
holds up. The test asserts the right fixture passes clean and the wrong one goes red
on exactly the probes built to catch those defects. A conformance suite that has
never been shown failing proves nothing about what it actually checks.

Ogen passes all probes; run it yourself.
