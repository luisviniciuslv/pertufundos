import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 80;
const host = process.env.HOST || "0.0.0.0";

function hasRequiredBuildDeps() {
  try {
    const reqShared = createRequire(
      pathToFileURL(path.join(__dirname, "packages/shared/package.json")).href,
    );
    const reqWeb = createRequire(
      pathToFileURL(path.join(__dirname, "apps/web/package.json")).href,
    );
    reqShared.resolve("typescript/bin/tsc");
    reqWeb.resolve("next/dist/bin/next");
    return true;
  } catch {
    return false;
  }
}

function ensureBuiltArtifacts() {
  const apiEntry = path.join(__dirname, "apps/api/dist/bootstrap.js");
  const webBuildId = path.join(__dirname, "apps/web/.next/BUILD_ID");

  if (fs.existsSync(apiEntry) && fs.existsSync(webBuildId)) {
    return;
  }

  if (!hasRequiredBuildDeps()) {
    console.log("📥 Instalando dependências de build do workspace (npm install)...");
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const installRes = spawnSync(npmCmd, ["install", "--no-audit", "--no-fund"], {
      cwd: __dirname,
      stdio: "inherit",
      env: process.env,
    });
    if (installRes.status !== 0) {
      throw new Error(`npm install falhou com código ${installRes.status ?? "unknown"}`);
    }
  }

  console.log("📦 Artefatos de produção ausentes (deploy direto via Git). Executando build econômico em etapas...");
  const res = spawnSync(process.execPath, [path.join(__dirname, "scripts/lowmem-build.mjs")], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });

  if (res.status !== 0) {
    throw new Error(`Build econômico falhou com código ${res.status ?? "unknown"}`);
  }
}

async function start() {
  ensureBuiltArtifacts();

  const requireFromWeb = createRequire(
    pathToFileURL(path.join(__dirname, "apps/web/package.json")).href,
  );
  const requireFromApi = createRequire(
    pathToFileURL(path.join(__dirname, "apps/api/package.json")).href,
  );

  const nextModule = requireFromWeb("next");
  const next = nextModule.default ?? nextModule;
  const { getRequestListener } = requireFromApi("@hono/node-server");
  const { initializeApiRuntime } = await import("./apps/api/dist/bootstrap.js");

  const { app, config } = await initializeApiRuntime();
  const apiHandler = getRequestListener(app.fetch);

  const nextApp = next({
    dev: false,
    dir: path.join(__dirname, "apps/web"),
  });
  await nextApp.prepare();
  const nextHandler = nextApp.getRequestHandler();

  const server = http.createServer((req, res) => {
    const reqUrl = req.url || "/";
    if (reqUrl === "/api/v1" || reqUrl.startsWith("/api/v1/") || reqUrl.startsWith("/api/v1?")) {
      return apiHandler(req, res);
    }
    return nextHandler(req, res);
  });

  server.listen(port, host, () => {
    console.log(
      `🚀 Pertufundos (Web + API) online em http://${host}:${port} (driver=${config.STORAGE_DRIVER})`,
    );
  });
}

start().catch((err) => {
  console.error("Falha fatal ao iniciar Pertufundos:", err);
  process.exit(1);
});
