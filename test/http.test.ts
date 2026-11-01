import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "../src/index.js";
import { startHttpServer, isOriginAllowed, isHostHeaderAllowed } from "../src/http.js";
import { makeTempDir } from "./helpers/tmpdir.js";
import { installFakeJhipster } from "./helpers/fakeJhipster.js";
import { getText } from "./helpers/mcp.js";

describe("Streamable HTTP transport", () => {
  it("binds on an ephemeral port (0), lists tools, and executes a tool call end-to-end", async () => {
    const tmp = await makeTempDir();
    const fake = await installFakeJhipster();
    const handle = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      createServer,
    });

    const transport = new StreamableHTTPClientTransport(new URL(handle.url));
    const client = new Client({ name: "http-test-client", version: "0.0.0" });

    try {
      assert.ok(handle.port > 0, "expected an assigned ephemeral port");
      await client.connect(transport);
      assert.ok(transport.sessionId, "expected a session ID from stateful server");

      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      assert.equal(tools.length, 13);
      assert.ok(toolNames.includes("info"));
      assert.ok(toolNames.includes("validate_jdl"));
      assert.ok(toolNames.includes("create_app_from_jdl"));

      const realDir = await fs.realpath(tmp.path);
      const res = await client.callTool({
        name: "info",
        arguments: { workingDirectory: realDir },
      });
      assert.notEqual(res.isError, true);
      const text = getText(res as { content: Array<{ type: string; text?: string }> });
      const match = text.match(/\[fake-jhipster\] (\{.+\})/);
      assert.ok(match, `expected fake-jhipster output in: ${text}`);
      const inv = JSON.parse(match[1]!) as { cwd: string; args: string[] };
      assert.equal(inv.cwd, realDir);
      assert.deepEqual(inv.args, ["info"]);

      await transport.terminateSession();
    } finally {
      await client.close().catch(() => {});
      await handle.close();
      fake.restorePath();
      await fake.cleanup();
      await tmp.cleanup();
    }
  });

  it("rejects requests with a non-loopback Origin header (DNS rebinding protection)", async () => {
    const handle = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      createServer,
    });
    try {
      const res = await fetch(handle.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          origin: "http://evil.example.com",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "evil", version: "0" },
          },
        }),
      });
      assert.equal(res.status, 403);
    } finally {
      await handle.close();
    }
  });

  it("returns 404 for paths other than /mcp and for unknown session IDs", async () => {
    const handle = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      createServer,
    });
    try {
      const wrongPath = await fetch(`http://127.0.0.1:${handle.port}/other`);
      assert.equal(wrongPath.status, 404);

      const unknownSession = await fetch(handle.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-session-id": "non-existent-session",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      assert.equal(unknownSession.status, 404);
    } finally {
      await handle.close();
    }
  });

  it("refuses to start on a non-loopback address without JHIPSTER_MCP_ROOT", async () => {
    await assert.rejects(
      () =>
        startHttpServer({
          host: "0.0.0.0",
          port: 0,
          rootDir: undefined,
          createServer,
        }),
      /Refusing to bind HTTP transport to non-loopback host/,
    );
  });

  it("validates Origin and Host headers accurately", () => {
    assert.equal(isOriginAllowed(undefined, "127.0.0.1"), true);
    assert.equal(isOriginAllowed("http://localhost:3000", "127.0.0.1"), true);
    assert.equal(isOriginAllowed("http://127.0.0.1:8080", "127.0.0.1"), true);
    assert.equal(isOriginAllowed("http://[::1]:3000", "127.0.0.1"), true);
    assert.equal(isOriginAllowed("http://attacker.com", "127.0.0.1"), false);
    assert.equal(isOriginAllowed("not-a-url", "127.0.0.1"), false);

    assert.equal(isHostHeaderAllowed("127.0.0.1:3333", "127.0.0.1"), true);
    assert.equal(isHostHeaderAllowed("localhost:3333", "127.0.0.1"), true);
    assert.equal(isHostHeaderAllowed("rebind.attacker.com:3333", "127.0.0.1"), false);
  });
});
