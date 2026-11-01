import path from "node:path";

/**
 * Server configuration read from the environment at startup. Everything here is
 * optional — with no env set, the server behaves exactly as before (no jail,
 * no extra flags, global `jhipster`). Configuring it lets a host expose the
 * server to less-trusted callers: confine writes to a directory, pin the
 * generator version, and force default flags onto every run.
 *
 * Env vars:
 *   JHIPSTER_MCP_ROOT               absolute dir the server refuses to escape
 *   JHIPSTER_MCP_DEFAULT_ARGS       whitespace-separated flags added to every run
 *   JHIPSTER_MCP_GENERATOR_VERSION  pin generator-jhipster (run via npx)
 *   JHIPSTER_MCP_TRANSPORT          "stdio" (default) or "http"
 *   JHIPSTER_MCP_HOST               HTTP bind host (default "127.0.0.1")
 *   JHIPSTER_MCP_PORT               HTTP bind port (default 3333)
 */
export type TransportMode = "stdio" | "http";

export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 3333;

export interface ServerConfig {
  /** Absolute root that every user-supplied workingDirectory/dir must stay within. */
  rootDir?: string;
  /** Flags appended to every `jhipster` invocation. */
  defaultArgs: string[];
  /** Pinned generator-jhipster version/tag; when set, runs are dispatched via npx. */
  generatorVersion?: string;
  /** Selected MCP transport ("stdio" by default). */
  transport?: TransportMode;
  /** Host/interface to bind when transport === "http" ("127.0.0.1" by default). */
  host?: string;
  /** TCP port to bind when transport === "http" (3333 by default; 0 for an ephemeral port). */
  port?: number;
}

// Same permissive-but-shell-safe arg class used by the run_jhipster allowlist.
const ARG_OK = /^[A-Za-z0-9_./=:@,+-]+$/;
const VERSION_OK = /^[A-Za-z0-9._-]+$/;

let cached: ServerConfig | undefined;

function parseTransport(raw: string, source: string): TransportMode {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "stdio" || normalized === "http") {
    return normalized;
  }
  throw new Error(`${source} must be "stdio" or "http", got: "${raw}"`);
}

function parsePort(raw: string, source: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${source} must be an integer between 0 and 65535, got: "${raw}"`);
  }
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 0 || num > 65535) {
    throw new Error(`${source} must be an integer between 0 and 65535, got: "${raw}"`);
  }
  return num;
}

function parseCliArgs(argv: string[]): {
  transport?: TransportMode;
  host?: string;
  port?: number;
} {
  let transport: TransportMode | undefined;
  let host: string | undefined;
  let port: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--http") {
      transport = "http";
    } else if (arg === "--stdio") {
      transport = "stdio";
    } else if (arg === "--transport") {
      const next = argv[++i];
      if (next === undefined) {
        throw new Error("--transport requires a value (\"stdio\" or \"http\")");
      }
      transport = parseTransport(next, "--transport");
    } else if (arg.startsWith("--transport=")) {
      transport = parseTransport(arg.slice("--transport=".length), "--transport");
    } else if (arg === "--host") {
      const next = argv[++i];
      if (!next || !next.trim()) {
        throw new Error("--host requires a non-empty hostname or IP address");
      }
      host = next.trim();
    } else if (arg.startsWith("--host=")) {
      const val = arg.slice("--host=".length).trim();
      if (!val) {
        throw new Error("--host requires a non-empty hostname or IP address");
      }
      host = val;
    } else if (arg === "--port") {
      const next = argv[++i];
      if (next === undefined) {
        throw new Error("--port requires a port number (0-65535)");
      }
      port = parsePort(next, "--port");
    } else if (arg.startsWith("--port=")) {
      port = parsePort(arg.slice("--port=".length), "--port");
    }
  }

  return { transport, host, port };
}

/** Parse + validate config from an env bag and optional CLI args (CLI takes precedence). Throws on malformed values (fail fast at startup). */
export function readConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = []): ServerConfig {
  const rootRaw = env.JHIPSTER_MCP_ROOT?.trim();
  if (rootRaw && !path.isAbsolute(rootRaw)) {
    throw new Error(`JHIPSTER_MCP_ROOT must be an absolute path, got: ${rootRaw}`);
  }

  const defaultArgs = (env.JHIPSTER_MCP_DEFAULT_ARGS?.trim() ?? "")
    .split(/\s+/)
    .filter((a) => a.length > 0);
  for (const arg of defaultArgs) {
    if (!ARG_OK.test(arg)) {
      throw new Error(`JHIPSTER_MCP_DEFAULT_ARGS contains an unsafe argument: "${arg}"`);
    }
  }

  const generatorVersion = env.JHIPSTER_MCP_GENERATOR_VERSION?.trim() || undefined;
  if (generatorVersion && !VERSION_OK.test(generatorVersion)) {
    throw new Error(`JHIPSTER_MCP_GENERATOR_VERSION is not a valid version/tag: "${generatorVersion}"`);
  }

  const envTransportRaw = env.JHIPSTER_MCP_TRANSPORT?.trim();
  const envTransport = envTransportRaw ? parseTransport(envTransportRaw, "JHIPSTER_MCP_TRANSPORT") : undefined;

  const envHostRaw = env.JHIPSTER_MCP_HOST?.trim();
  const envHost = envHostRaw || undefined;

  const envPortRaw = env.JHIPSTER_MCP_PORT?.trim();
  const envPort = envPortRaw ? parsePort(envPortRaw, "JHIPSTER_MCP_PORT") : undefined;

  const cli = parseCliArgs(argv);

  return {
    rootDir: rootRaw ? path.resolve(rootRaw) : undefined,
    defaultArgs,
    generatorVersion,
    transport: cli.transport ?? envTransport ?? "stdio",
    host: cli.host ?? envHost ?? DEFAULT_HTTP_HOST,
    port: cli.port ?? envPort ?? DEFAULT_HTTP_PORT,
  };
}

/** True when `host` is a loopback address (`127.x.x.x`, `::1`, `[::1]`, or `localhost`). */
export function isLoopbackHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  const unwrapped = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return unwrapped === "localhost" || unwrapped === "::1" || /^127(?:\.\d{1,3}){3}$/.test(unwrapped);
}

/**
 * Guard against exposing unrestricted filesystem writes over a non-loopback
 * network interface: require `JHIPSTER_MCP_ROOT` whenever the HTTP server binds
 * to a non-loopback address.
 */
export function assertSafeHttpConfig(cfg: ServerConfig): void {
  const host = cfg.host ?? DEFAULT_HTTP_HOST;
  if (!isLoopbackHost(host) && !cfg.rootDir) {
    throw new Error(
      `Refusing to bind HTTP transport to non-loopback host "${host}" without JHIPSTER_MCP_ROOT set. ` +
        `Set JHIPSTER_MCP_ROOT to an absolute directory to confine filesystem access, or bind to 127.0.0.1.`,
    );
  }
}

/** Memoized config for the process. */
export function getConfig(): ServerConfig {
  return (cached ??= readConfig());
}

/** Test seam: clear the memoized config so the next getConfig() re-reads the env. */
export function resetConfigForTest(): void {
  cached = undefined;
}

/**
 * Enforce the sandbox root on a user-supplied directory. No-op when no root is
 * configured. Comparison is lexical (path.resolve normalizes `..`), so traversal
 * out of the root is rejected without needing the path to exist yet.
 */
export function assertWithinRoot(dir: string, cfg: ServerConfig = getConfig()): void {
  if (!cfg.rootDir) return;
  const resolved = path.resolve(dir);
  if (resolved !== cfg.rootDir && !resolved.startsWith(cfg.rootDir + path.sep)) {
    throw new Error(
      `Path "${dir}" is outside the configured sandbox root (${cfg.rootDir}). ` +
        `Set JHIPSTER_MCP_ROOT to widen it, or pass a directory inside the root.`,
    );
  }
}

/**
 * Resolve how to invoke the generator. Unpinned → the global `jhipster` binary.
 * Pinned → `npx -y -p generator-jhipster@<version> jhipster` so the exact
 * version runs regardless of what's installed globally.
 */
export function jhipsterCommand(cfg: ServerConfig = getConfig()): { command: string; prefixArgs: string[] } {
  if (cfg.generatorVersion) return jhipsterCommandForVersion(cfg.generatorVersion);
  return { command: "jhipster", prefixArgs: [] };
}

/** Build the npx invocation that runs an explicit generator version (used by the upgrade preview). */
export function jhipsterCommandForVersion(version: string): { command: string; prefixArgs: string[] } {
  if (!VERSION_OK.test(version)) {
    throw new Error(`Invalid generator version/tag: "${version}"`);
  }
  return { command: "npx", prefixArgs: ["-y", "-p", `generator-jhipster@${version}`, "jhipster"] };
}
