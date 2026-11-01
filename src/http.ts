import http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  assertSafeHttpConfig,
  getConfig,
  isLoopbackHost,
} from "./config.js";

export interface HttpServerOptions {
  /** Host/interface to bind (defaults to config.host or "127.0.0.1"). */
  host?: string;
  /** TCP port to bind (defaults to config.port or 3333; pass 0 for an ephemeral port). */
  port?: number;
  /** Optional explicit sandbox root override (defaults to config.rootDir). */
  rootDir?: string;
  /** Factory that builds a fresh McpServer with all tools/resources/prompts registered. */
  createServer: () => McpServer;
}

export interface HttpServerHandle {
  server: http.Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

function stripIpv6Brackets(host: string): string {
  const trimmed = host.trim().toLowerCase();
  return trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Validate the `Origin` header to prevent DNS-rebinding attacks from browsers
 * when running a local generator. Requests without an `Origin` header (non-browser
 * MCP clients) are allowed.
 */
export function isOriginAllowed(origin: string | undefined, boundHost: string): boolean {
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const originHost = stripIpv6Brackets(parsed.hostname);
  if (isLoopbackHost(originHost)) {
    return true;
  }
  const normalizedBound = stripIpv6Brackets(boundHost);
  return !isLoopbackHost(normalizedBound) && originHost === normalizedBound;
}

/**
 * Validate the `Host` header when bound to a loopback interface so a DNS-rebound
 * domain (e.g. `evil.example.com:3333` resolving to `127.0.0.1`) is rejected.
 */
export function isHostHeaderAllowed(hostHeader: string | undefined, boundHost: string): boolean {
  if (!hostHeader) return true;
  let hostname: string;
  try {
    hostname = stripIpv6Brackets(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
  if (isLoopbackHost(boundHost)) {
    return isLoopbackHost(hostname);
  }
  const normalizedBound = stripIpv6Brackets(boundHost);
  if (normalizedBound === "0.0.0.0" || normalizedBound === "::") {
    return true;
  }
  return isLoopbackHost(hostname) || hostname === normalizedBound;
}

function sendJsonError(
  res: http.ServerResponse,
  status: number,
  code: number,
  message: string,
  extraHeaders?: Record<string, string>,
): void {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
  res.writeHead(status, {
    "content-type": "application/json",
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * Start the Streamable HTTP MCP server mounted at `/mcp` (`POST`, `GET`, `DELETE`).
 * Each initialized session gets its own `McpServer` + `StreamableHTTPServerTransport`
 * instance keyed by `Mcp-Session-Id`.
 */
export async function startHttpServer(options: HttpServerOptions): Promise<HttpServerHandle> {
  const cfg = getConfig();
  const host = options.host ?? cfg.host ?? DEFAULT_HTTP_HOST;
  const requestedPort = options.port ?? cfg.port ?? DEFAULT_HTTP_PORT;
  const rootDir = options.rootDir !== undefined ? options.rootDir : cfg.rootDir;

  assertSafeHttpConfig({
    ...cfg,
    transport: "http",
    host,
    port: requestedPort,
    rootDir,
  });

  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = http.createServer(async (req, res) => {
    try {
      const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
      if (!isOriginAllowed(originHeader, host)) {
        sendJsonError(res, 403, -32000, "Forbidden: invalid Origin header");
        return;
      }

      const hostHeader = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
      if (!isHostHeaderAllowed(hostHeader, host)) {
        sendJsonError(res, 403, -32000, "Forbidden: invalid Host header");
        return;
      }

      let pathname: string;
      try {
        pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      } catch {
        sendJsonError(res, 400, -32000, "Bad Request: malformed URL");
        return;
      }

      if (pathname !== "/mcp") {
        sendJsonError(res, 404, -32000, "Not Found: MCP endpoint is mounted at /mcp");
        return;
      }

      if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
        sendJsonError(res, 405, -32000, "Method not allowed.", { allow: "GET, POST, DELETE" });
        return;
      }

      const rawSessionId = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;

      if (sessionId) {
        const existing = sessions.get(sessionId);
        if (!existing) {
          sendJsonError(res, 404, -32001, "Session not found");
          return;
        }
        await existing.transport.handleRequest(req, res);
        return;
      }

      if (req.method === "POST") {
        const mcpServer = options.createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { server: mcpServer, transport });
          },
          onsessionclosed: (sid) => {
            sessions.delete(sid);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);

        if (!transport.sessionId) {
          await mcpServer.close();
        }
        return;
      }

      sendJsonError(res, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
    } catch (err) {
      if (!res.headersSent) {
        sendJsonError(res, 500, -32603, err instanceof Error ? err.message : "Internal server error");
      } else {
        res.destroy();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      httpServer.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(requestedPort, host);
  });

  const addr = httpServer.address() as AddressInfo;
  const boundPort = addr.port;
  const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const url = `http://${urlHost}:${boundPort}/mcp`;

  const close = async (): Promise<void> => {
    const active = [...sessions.values()];
    sessions.clear();
    await Promise.allSettled(active.map((s) => s.server.close()));
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    server: httpServer,
    host,
    port: boundPort,
    url,
    close,
  };
}
