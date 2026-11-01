import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json" with { type: "json" };

import { readConfig } from "./config.js";
import { startHttpServer } from "./http.js";
import { registerValidateJdl } from "./tools/validateJdl.js";
import { registerCreateAppFromJdl } from "./tools/createAppFromJdl.js";
import { registerImportJdl } from "./tools/importJdl.js";
import { registerAddEntity } from "./tools/addEntity.js";
import { registerAddRelationship } from "./tools/addRelationship.js";
import { registerSetOption } from "./tools/setOption.js";
import { registerInfo } from "./tools/info.js";
import { registerGenerateCiCd } from "./tools/generateCiCd.js";
import { registerGenerateDeployment } from "./tools/generateDeployment.js";
import { registerProjectCommands } from "./tools/projectCommands.js";
import { registerUpgradeAdvisor } from "./tools/upgradeAdvisor.js";
import { registerPreviewUpgrade } from "./tools/previewUpgrade.js";
import { registerRunJhipster } from "./tools/runJhipster.js";
import { registerJdlGrammar } from "./resources/jdlGrammar.js";
import { registerProjectState } from "./resources/projectState.js";
import { registerScaffoldCrudMonolith } from "./prompts/scaffoldCrudMonolith.js";
import { registerAddAuditFields } from "./prompts/addAuditFields.js";
import { registerMonolithToMicroservices } from "./prompts/monolithToMicroservices.js";

/** Construct a fresh McpServer with all tools, resources, and prompts registered. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: pkg.name,
    version: pkg.version,
  });

  registerValidateJdl(server);
  registerCreateAppFromJdl(server);
  registerImportJdl(server);
  registerAddEntity(server);
  registerAddRelationship(server);
  registerSetOption(server);
  registerInfo(server);
  registerGenerateCiCd(server);
  registerGenerateDeployment(server);
  registerProjectCommands(server);
  registerUpgradeAdvisor(server);
  registerPreviewUpgrade(server);
  registerRunJhipster(server);
  registerJdlGrammar(server);
  registerProjectState(server);
  registerScaffoldCrudMonolith(server);
  registerAddAuditFields(server);
  registerMonolithToMicroservices(server);

  return server;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cfg = readConfig(process.env, argv);

  if (cfg.transport === "http") {
    const handle = await startHttpServer({
      host: cfg.host,
      port: cfg.port,
      rootDir: cfg.rootDir,
      createServer,
    });
    console.error(`[jhipster-mcp] Streamable HTTP server listening on ${handle.url}`);
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isDirectEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  }
}

if (isDirectEntry()) {
  main().catch((err) => {
    console.error("[jhipster-mcp] fatal:", err);
    process.exit(1);
  });
}
