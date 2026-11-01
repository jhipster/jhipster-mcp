# 8. Advanced usage & customization

← [Context management](07-context-management.md) · [Docs index](README.md) · Next → [How it works](09-how-it-works.md)

Once you're comfortable with the basics, here's how to bend the server to your workflow.

## Server configuration (environment variables & CLI flags)

The server reads optional environment variables and CLI flags at startup. They're set by your **host's MCP config** (the `env` block alongside `command`/`args`) or when launching the HTTP server directly, and they let you confine, pin, and standardize the server — useful when exposing it to less-trusted callers or locking a team to one generator version. **All options are opt-in: with none set, the server behaves exactly as the rest of these docs describe.**

| Variable | CLI flag | Effect |
|----------|----------|--------|
| `JHIPSTER_MCP_ROOT` | — | An **absolute** directory the server refuses to escape. Any `workingDirectory` (or resource `dir`) that isn't the root or inside it — including `..` traversal — is rejected before anything is created or run. A path-jail/sandbox. |
| `JHIPSTER_MCP_DEFAULT_ARGS` | — | Whitespace-separated flags appended to **every** `jhipster` invocation (e.g. `--no-insight --skip-install`). Validated for shell-safety at startup. |
| `JHIPSTER_MCP_GENERATOR_VERSION` | — | Pins the generator. When set, runs dispatch via `npx -y -p generator-jhipster@<version> jhipster …` instead of your global binary, so the exact version runs regardless of what's installed. |
| `JHIPSTER_MCP_TRANSPORT` | `--http`, `--stdio`, `--transport <stdio\|http>` | Transport mode: `"stdio"` (default) or `"http"` (Streamable HTTP mounted at `/mcp`). CLI flags take precedence over environment variables. |
| `JHIPSTER_MCP_HOST` | `--host <host>` | Interface to bind in HTTP mode (default `127.0.0.1`). Binding to a non-loopback address requires `JHIPSTER_MCP_ROOT` to be set. |
| `JHIPSTER_MCP_PORT` | `--port <port>` | TCP port to bind in HTTP mode (default `3333`; `0` selects an ephemeral port). |

Example host config:

```json
{
  "mcpServers": {
    "jhipster": {
      "command": "npx",
      "args": ["-y", "jhipster-mcp"],
      "env": {
        "JHIPSTER_MCP_ROOT": "/Users/me/projects",
        "JHIPSTER_MCP_GENERATOR_VERSION": "8.7.4",
        "JHIPSTER_MCP_DEFAULT_ARGS": "--no-insight"
      }
    }
  }
}
```

Notes:
- A bad value (relative root, unsafe default arg, malformed version) makes the server **fail fast at startup** rather than misbehave later.
- The jail check is **lexical** (it normalizes `..`), so it works even for a target directory that doesn't exist yet — e.g. a new app you're about to scaffold.
- It applies to **every** tool and resource, including read-only `info` and the project-state resources — nothing reads or writes outside the root.
- `JHIPSTER_MCP_DEFAULT_ARGS` applies to *every* invocation, so prefer flags that are valid across subcommands.

## Forward extra flags with `extraArgs`

`create_app_from_jdl`, `import_jdl`, and `generate_ci_cd` accept an `extraArgs` array that's passed straight through to the underlying `jhipster` command. Use it for generator flags this server doesn't model explicitly:

> Create the app in `/tmp/shop` but skip the npm install — pass `--skip-install`.

→ `create_app_from_jdl` with `extraArgs: ["--skip-install"]`.

Common picks: `--skip-install`, `--skip-client`, `--skip-server`. For blueprints, prefer the dedicated `blueprints` parameter below over `extraArgs`.

## Blueprints

[Blueprints](https://www.jhipster.tech/modules/extending-and-customizing/) swap or extend parts of the generator (e.g. `kotlin`, `nodejs`, `dotnetcore`, `ionic`). `create_app_from_jdl` and `import_jdl` take a first-class **`blueprints`** array, mapped to `--blueprints`:

> Scaffold the app in `/tmp/shop` from this JDL using the `kotlin` blueprint.

→ `create_app_from_jdl` with `blueprints: ["kotlin"]` → runs `jhipster jdl … --blueprints kotlin`.

- Pass several: `["kotlin", "ionic"]` → `--blueprints kotlin,ionic`.
- Scoped packages work: `["@my-org/generator-jhipster-foo"]`.
- Names are **validated** (npm-package shape) so they can't smuggle in extra CLI flags or shell characters.
- It flows into a **dry run** too, so you can preview a blueprint generation.
- **You must install the blueprint** where `jhipster` runs (e.g. `npm i -g generator-jhipster-kotlin`); this server only passes the flag. After the app is first created with a blueprint, it's recorded in `.yo-rc.json` and applied automatically on later runs — so you usually only need `blueprints` at creation time.

## Upgrading your JHipster version

Upgrading a JHipster app between generator versions has always been painful. Two read-only tools help you scope and preview it — neither runs the upgrade or touches git:

1. **[`upgrade_advisor`](04-tools.md#upgrade_advisor)** — the pre-flight. Reports your current version, the bump type vs. a target, a risk rating, project-specific considerations (blueprints, microservices, entity count), a checklist, and links to the release notes. Start here to understand scope.

   > How risky is moving `/Users/me/projects/shop` from its current version to 8.7.4?

2. **[`preview_upgrade`](04-tools.md#preview_upgrade)** — the diff. Regenerates your project's model in an isolated temp copy (optionally with a `targetVersion`, fetched via `npx`) and shows which files would be **added / removed / modified** — without writing anything.

   > Show me what upgrading `/Users/me/projects/shop` to 8.7.4 would change.

How to read the preview:
- **`modified` mixes two things**: changes the new generator makes *and* your own customizations to generated files. Review each — that's the real work of any JHipster upgrade.
- It's **git-free by design**. Apply whatever you want through your own git workflow (commit first so the eventual changes are easy to review).
- For the exact **breaking changes** between versions, consult the release notes the advisor links — the tools gather facts and diffs, but don't enumerate version-specific breaking changes.
- The official, git-based `jhipster upgrade` is intentionally **not** wrapped (it would break the no-git principle); it remains reachable via [`run_jhipster`](#the-run_jhipster-escape-hatch) for the adventurous.

## The `run_jhipster` escape hatch

When no dedicated tool covers what you need, `run_jhipster` runs an **allowlisted** subcommand directly. The allowlist:

```
info, jdl, entity, import-jdl, ci-cd, upgrade, languages,
openapi-client, kubernetes, docker-compose, heroku,
azure-app-service, azure-spring-cloud, aws-amplify,
export-jdl, completion
```

Each arg must match a safe character pattern (`[A-Za-z0-9_./=:@,+-]`) — anything with shell metacharacters is rejected, and the server never invokes a shell. `--force` is appended automatically.

> Export the current model of `/Users/me/projects/shop` to `current.jdl`.

→ `run_jhipster` with `subcommand=export-jdl, args=["current.jdl"]`.

For `kubernetes` / `docker-compose`, prefer the dedicated [`generate_deployment`](04-tools.md#generate_deployment) tool. `run_jhipster` remains the way to reach the **cloud** targets (`heroku`, the Azure/AWS generators) that don't have dedicated tools yet.

## Pin the generator and the server versions

- **Server version:** pin in your host config — `npx -y jhipster-mcp@0.0.6`. See [Installation](02-installation.md#pinning-and-global-install).
- **Generator version:** either manage your global install (`npm install -g generator-jhipster@<version>`), or set **`JHIPSTER_MCP_GENERATOR_VERSION`** (see above) to have the server run that exact version via npx regardless of the global one.

## Prompting tips

These make the agent faster and more accurate:

- **Always give an absolute path.** All tools require `workingDirectory`; "the current folder" won't resolve.
- **Be specific about field types and validations** (e.g. `price BigDecimal required min(0)`) — it saves a round-trip to the grammar resource.
- **Empty the target dir first for new apps.** `create_app_from_jdl` refuses a non-empty directory.
- **Prefer one big `import_jdl` over many granular calls** for coordinated changes — one generator run instead of N.
- **Ask for a dry run when unsure.** "Show me what this would change, don't write yet" → the agent adds `dryRun: true`.
- **Use prompts for common jobs** (CRUD monolith, audit fields, microservice split) — they encode the good defaults. See [page 6](06-prompts.md).

## Safe-apply with rollback

For risky changes to a project that has uncommitted work, pass **`backup: true`** to `import_jdl`, `add_entity`, `add_relationship`, or `set_option`:

> In `/Users/me/projects/shop`, apply this JDL but take a backup first so I can roll back.

The server snapshots the project (minus `node_modules`/`.git`/build output) into a temp dir before the `--force` run, and returns the backup path plus a ready-to-paste rollback command. It's a **backup directory, not git** — your repo is untouched. If your tree is already clean under git, a commit/stash does the same job; `backup` exists for when it isn't. Details in [Tools → Safe-apply](04-tools.md#safe-apply-backup--rollback).

## Safety controls (what protects you)

- **Directory scoping** — the server only acts inside the `workingDirectory` you pass; it has no cwd of its own. Tighten this to a fixed sandbox with `JHIPSTER_MCP_ROOT` (see [Server configuration](#server-configuration-environment-variables)).
- **Opt-in backup/rollback** — `backup: true` snapshots an existing project before a `--force` apply (see above).
- **Empty-dir guard** — `create_app_from_jdl` won't overwrite a populated directory (`.git`/`.DS_Store` ignored).
- **No shell** — every spawn uses `shell: false`; `run_jhipster` validates the subcommand against the allowlist and rejects metacharacter args.
- **JDL injection guard** — entity/field/type/package names are validated against strict regexes before any JDL is built, so a malicious "name" can't inject JDL.
- **Preview-first** — `dryRun` and `validate_jdl` let you see every change before it touches disk (and they run in isolation — [page 7](07-context-management.md)).

## Scope reminder

The server **won't** run `mvn`/`npm` builds, start the app, run its tests, or touch git. That's deliberate. Use your host's shell tooling for those — keeping generation and build/run separate is what makes this server safe to hand broad access to.

---

Next: [How it works (engine)](09-how-it-works.md) — for the curious.
