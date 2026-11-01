import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  readConfig,
  assertWithinRoot,
  assertSafeHttpConfig,
  isLoopbackHost,
  jhipsterCommand,
  jhipsterCommandForVersion,
} from "../src/config.js";

describe("readConfig", () => {
  it("defaults to empty when nothing is set", () => {
    const c = readConfig({});
    assert.equal(c.rootDir, undefined);
    assert.deepEqual(c.defaultArgs, []);
    assert.equal(c.generatorVersion, undefined);
    assert.equal(c.transport, "stdio");
    assert.equal(c.host, "127.0.0.1");
    assert.equal(c.port, 3333);
  });

  it("reads transport, host, and port from environment variables", () => {
    const c = readConfig({
      JHIPSTER_MCP_TRANSPORT: "http",
      JHIPSTER_MCP_HOST: "0.0.0.0",
      JHIPSTER_MCP_PORT: "4567",
    });
    assert.equal(c.transport, "http");
    assert.equal(c.host, "0.0.0.0");
    assert.equal(c.port, 4567);
  });

  it("lets CLI flags override environment variables", () => {
    const c = readConfig(
      {
        JHIPSTER_MCP_TRANSPORT: "stdio",
        JHIPSTER_MCP_HOST: "127.0.0.1",
        JHIPSTER_MCP_PORT: "3333",
      },
      ["--http", "--host", "localhost", "--port", "8088"],
    );
    assert.equal(c.transport, "http");
    assert.equal(c.host, "localhost");
    assert.equal(c.port, 8088);
  });

  it("supports --transport=http, --host=..., --port=..., and --stdio flags", () => {
    const c = readConfig({}, ["--transport=http", "--host=::1", "--port=0"]);
    assert.equal(c.transport, "http");
    assert.equal(c.host, "::1");
    assert.equal(c.port, 0);

    const c2 = readConfig({ JHIPSTER_MCP_TRANSPORT: "http" }, ["--stdio"]);
    assert.equal(c2.transport, "stdio");
  });

  it("rejects invalid transport or port values", () => {
    assert.throws(() => readConfig({ JHIPSTER_MCP_TRANSPORT: "ws" }), /must be "stdio" or "http"/);
    assert.throws(() => readConfig({}, ["--transport", "grpc"]), /must be "stdio" or "http"/);
    assert.throws(() => readConfig({ JHIPSTER_MCP_PORT: "70000" }), /between 0 and 65535/);
    assert.throws(() => readConfig({}, ["--port", "abc"]), /between 0 and 65535/);
  });

  it("resolves an absolute root and rejects a relative one", () => {
    assert.equal(readConfig({ JHIPSTER_MCP_ROOT: "/srv/apps" }).rootDir, path.resolve("/srv/apps"));
    assert.throws(() => readConfig({ JHIPSTER_MCP_ROOT: "relative/apps" }), /absolute path/);
  });

  it("splits default args and rejects unsafe ones", () => {
    assert.deepEqual(readConfig({ JHIPSTER_MCP_DEFAULT_ARGS: "  --skip-install   --no-insight " }).defaultArgs, [
      "--skip-install",
      "--no-insight",
    ]);
    assert.throws(() => readConfig({ JHIPSTER_MCP_DEFAULT_ARGS: "--foo; rm -rf /" }), /unsafe argument/);
  });

  it("accepts a valid generator version and rejects a malformed one", () => {
    assert.equal(readConfig({ JHIPSTER_MCP_GENERATOR_VERSION: "8.7.4" }).generatorVersion, "8.7.4");
    assert.equal(readConfig({ JHIPSTER_MCP_GENERATOR_VERSION: "latest" }).generatorVersion, "latest");
    assert.throws(() => readConfig({ JHIPSTER_MCP_GENERATOR_VERSION: "8;evil" }), /not a valid version/);
  });
});

describe("assertWithinRoot", () => {
  const cfg = { rootDir: path.resolve("/srv/apps"), defaultArgs: [] };

  it("is a no-op when no root is configured", () => {
    assert.doesNotThrow(() => assertWithinRoot("/anywhere", { defaultArgs: [] }));
  });

  it("allows the root itself and paths inside it", () => {
    assert.doesNotThrow(() => assertWithinRoot("/srv/apps", cfg));
    assert.doesNotThrow(() => assertWithinRoot("/srv/apps/shop", cfg));
    assert.doesNotThrow(() => assertWithinRoot("/srv/apps/nested/deep", cfg));
  });

  it("rejects paths outside the root, including traversal", () => {
    assert.throws(() => assertWithinRoot("/srv/other", cfg), /outside the configured sandbox root/);
    assert.throws(() => assertWithinRoot("/srv/apps/../other", cfg), /outside the configured sandbox root/);
    assert.throws(() => assertWithinRoot("/srv/apps-evil", cfg), /outside the configured sandbox root/);
  });
});

describe("jhipsterCommand", () => {
  it("uses the global binary when unpinned", () => {
    assert.deepEqual(jhipsterCommand({ defaultArgs: [] }), { command: "jhipster", prefixArgs: [] });
  });

  it("dispatches via npx when a version is pinned", () => {
    assert.deepEqual(jhipsterCommand({ defaultArgs: [], generatorVersion: "8.7.4" }), {
      command: "npx",
      prefixArgs: ["-y", "-p", "generator-jhipster@8.7.4", "jhipster"],
    });
  });
});

describe("jhipsterCommandForVersion", () => {
  it("builds an npx invocation for an explicit version", () => {
    assert.deepEqual(jhipsterCommandForVersion("8.0.0"), {
      command: "npx",
      prefixArgs: ["-y", "-p", "generator-jhipster@8.0.0", "jhipster"],
    });
  });
  it("rejects an unsafe version string", () => {
    assert.throws(() => jhipsterCommandForVersion("8;rm"), /Invalid generator version/);
  });
});

describe("isLoopbackHost & assertSafeHttpConfig", () => {
  it("recognizes loopback hosts", () => {
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("127.0.1.1"), true);
    assert.equal(isLoopbackHost("localhost"), true);
    assert.equal(isLoopbackHost("::1"), true);
    assert.equal(isLoopbackHost("[::1]"), true);
    assert.equal(isLoopbackHost("0.0.0.0"), false);
    assert.equal(isLoopbackHost("192.168.1.10"), false);
  });

  it("requires JHIPSTER_MCP_ROOT when bound to a non-loopback host", () => {
    assert.doesNotThrow(() => assertSafeHttpConfig({ defaultArgs: [], host: "127.0.0.1" }));
    assert.throws(
      () => assertSafeHttpConfig({ defaultArgs: [], host: "0.0.0.0" }),
      /Refusing to bind HTTP transport to non-loopback host/,
    );
    assert.doesNotThrow(() =>
      assertSafeHttpConfig({ defaultArgs: [], host: "0.0.0.0", rootDir: path.resolve("/srv/apps") }),
    );
  });
});
