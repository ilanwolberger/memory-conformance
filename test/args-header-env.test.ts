// lib/args.ts's --header-env: resolves a header's value from an environment
// variable instead of argv, so a bearer token never appears in a process
// listing or shell history the way a literal --header "Authorization: Bearer
// <token>" does. Offline — parseArgs takes an injectable env object for
// exactly this test, a real run always resolves against process.env.

import { describe, it, expect } from "vitest";
import { parseArgs } from "../lib/args.js";

describe("--header-env", () => {
  it("resolves a header from the named environment variable", () => {
    const args = parseArgs(
      ["--url", "https://example.com/mcp", "--header-env", "MY_AUTH"],
      { MY_AUTH: "Authorization: Bearer secret-token-value" }
    );
    expect(args.headers).toEqual({ Authorization: "Bearer secret-token-value" });
  });

  it("is repeatable and freely mixable with --header", () => {
    const args = parseArgs(
      [
        "--url", "https://example.com/mcp",
        "--header", "X-Plain: plain-value",
        "--header-env", "MY_AUTH",
        "--header-env", "MY_OTHER",
      ],
      { MY_AUTH: "Authorization: Bearer secret-token-value", MY_OTHER: "X-Tenant: acme" }
    );
    expect(args.headers).toEqual({
      "X-Plain": "plain-value",
      Authorization: "Bearer secret-token-value",
      "X-Tenant": "acme",
    });
  });

  it("throws a clear error when the named variable is unset", () => {
    expect(() =>
      parseArgs(["--url", "https://example.com/mcp", "--header-env", "MISSING_VAR"], {})
    ).toThrow(/MISSING_VAR/);
  });

  it("throws a clear error when the named variable is set but empty", () => {
    expect(() =>
      parseArgs(["--url", "https://example.com/mcp", "--header-env", "EMPTY_VAR"], { EMPTY_VAR: "" })
    ).toThrow(/EMPTY_VAR/);
  });

  it("throws when the variable's value has no 'Name:' prefix", () => {
    expect(() =>
      parseArgs(["--url", "https://example.com/mcp", "--header-env", "BAD_SHAPE"], { BAD_SHAPE: "not-a-header-line" })
    ).toThrow(/Name: value/);
  });

  it("throws when --header-env is given no variable name at all", () => {
    expect(() => parseArgs(["--url", "https://example.com/mcp", "--header-env"], {})).toThrow(
      /requires an environment variable name/
    );
  });

  it("never reads real process.env when a fake env is injected — proves the value truly comes from the passed-in env, not ambient state", () => {
    const originalValue = process.env.MY_AUTH;
    process.env.MY_AUTH = "Authorization: Bearer AMBIENT-LEAK";
    try {
      const args = parseArgs(
        ["--url", "https://example.com/mcp", "--header-env", "MY_AUTH"],
        { MY_AUTH: "Authorization: Bearer injected-value" }
      );
      expect(args.headers.Authorization).toBe("Bearer injected-value");
    } finally {
      if (originalValue === undefined) delete process.env.MY_AUTH;
      else process.env.MY_AUTH = originalValue;
    }
  });
});
