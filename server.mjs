import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 80;
const host = process.env.HOST || "0.0.0.0";

// Silencia apenas o aviso cosmético do Node 26 quando libs Web3 consultam `localStorage` no SSR
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const message = typeof warning === "string" ? warning : warning?.message || "";
  if (message.includes("localStorage is not available")) return;
  return originalEmitWarning.call(process, warning, ...args);
};

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

function getNewestMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const childMtime = getNewestMtimeMs(path.join(targetPath, entry.name));
    if (childMtime > newest) newest = childMtime;
  }
  return newest;
}

function ensureBuiltArtifacts() {
  const apiEntry = path.join(__dirname, "apps/api/dist/bootstrap.js");
  const webBuildId = path.join(__dirname, "apps/web/.next/BUILD_ID");

  const artifactsExist = fs.existsSync(apiEntry) && fs.existsSync(webBuildId);
  if (artifactsExist) {
    const oldestArtifactMtime = Math.min(
      fs.statSync(apiEntry).mtimeMs,
      fs.statSync(webBuildId).mtimeMs,
    );
    const newestSourceMtime = Math.max(
      getNewestMtimeMs(path.join(__dirname, "packages/shared/src")),
      getNewestMtimeMs(path.join(__dirname, "apps/api/src")),
      getNewestMtimeMs(path.join(__dirname, "apps/web/src")),
      getNewestMtimeMs(path.join(__dirname, "apps/web/next.config.mjs")),
      getNewestMtimeMs(path.join(__dirname, "scripts/lowmem-build.mjs")),
    );
    if (newestSourceMtime <= oldestArtifactMtime) {
      return;
    }
    console.log("🔄 Código-fonte atualizado detectado via Git. Recompilando em etapas econômicas...");
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
