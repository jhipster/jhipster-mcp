# 2. Installation

← [Introduction](01-introduction.md) · [Docs index](README.md) · Next → [Getting started](03-getting-started.md)

## Prerequisites

- **Node.js 20+** (the server runs on Node).
- A working **global `jhipster` CLI** on your `PATH`:
  ```bash
  npm install -g generator-jhipster
  jhipster --version
  ```
- **Java, Maven/Gradle, a database, etc.** — whatever the *generated* project itself needs. The server only scaffolds; you still build and run with your usual toolchain.

> The server spawns your existing global `jhipster` binary — it does **not** bundle the generator. Whatever `jhipster` does on your command line is what it'll do here.

## Connect it to your host

The package is published on npm as **[jhipster-mcp](https://www.npmjs.com/package/jhipster-mcp)**. You don't clone or build anything — your host launches it via `npx`, which downloads and caches it automatically.

### Claude Code

```bash
claude mcp add jhipster -- npx -y jhipster-mcp
```

Or add it to your MCP config (e.g. `~/.claude/mcp.json`) manually:

```json
{
  "mcpServers": {
    "jhipster": {
      "command": "npx",
      "args": ["-y", "jhipster-mcp"]
    }
  }
}
```

### Claude Desktop

Add the same `mcpServers` block to:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Then restart the app.

### Cursor / other MCP hosts

Use the same `command` / `args` pair in whatever MCP config your host exposes.

### Streamable HTTP mode (remote / containerized / web hosts)

By default `jhipster-mcp` runs over **stdio**. To expose it over **Streamable HTTP** (`POST`/`GET`/`DELETE` on `/mcp`), pass `--http` (or set `JHIPSTER_MCP_TRANSPORT=http`):

```bash
# Default bind: http://127.0.0.1:3333/mcp
npx -y jhipster-mcp --http --port 3333

# Or via environment variables
JHIPSTER_MCP_TRANSPORT=http JHIPSTER_MCP_PORT=3333 npx -y jhipster-mcp
```

Then configure your MCP client to connect to `http://127.0.0.1:3333/mcp`. When binding to a non-loopback address (e.g. `--host 0.0.0.0` inside Docker), you must also set `JHIPSTER_MCP_ROOT` to confine filesystem writes — see [Server configuration](08-advanced-and-customization.md#server-configuration-environment-variables--cli-flags).

### Optional: sandbox & pin via environment variables

You can confine the server to a directory, pin the generator version, or force default flags by adding an `env` block to the config above (`JHIPSTER_MCP_ROOT`, `JHIPSTER_MCP_GENERATOR_VERSION`, `JHIPSTER_MCP_DEFAULT_ARGS`). All optional — see [Server configuration](08-advanced-and-customization.md#server-configuration-environment-variables).

### Pinning and global install

- **Pin a version:** `npx -y jhipster-mcp@0.0.5`.
- **Install once instead of resolving via `npx` each launch:**
  ```bash
  npm install -g jhipster-mcp
  ```
  then set `"command": "jhipster-mcp"` with no `args`.

## Install from source (only to hack on the server)

```bash
git clone https://github.com/avdev4j/jhipster-mcp.git
cd jhipster-mcp
npm install
npm run build
```

The built entry point lands at `dist/index.js` (marked executable). Point your host at the local build:

```json
{
  "mcpServers": {
    "jhipster": {
      "command": "node",
      "args": ["/absolute/path/to/jhipster-mcp/dist/index.js"]
    }
  }
}
```

## Verify the connection

After adding the server, **restart your host**. Then either:

- Ask the host to list its MCP tools — you should see `validate_jdl`, `create_app_from_jdl`, `info`, and the rest.
- Or run a quick stdio smoke test directly (lists tools without a host):
  ```bash
  (cat <<'EOF'
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
  {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
  {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
  EOF
  ) | npx -y jhipster-mcp
  ```

If the tools list comes back, you're connected.

---

Next: [Getting started](03-getting-started.md) — your first session.
