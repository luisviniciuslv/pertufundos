import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const requireFromShared = createRequire(
  pathToFileURL(path.join(rootDir, "packages/shared/package.json")).href,
);
const requireFromApi = createRequire(
  pathToFileURL(path.join(rootDir, "apps/api/package.json")).href,
);
const requireFromWeb = createRequire(
  pathToFileURL(path.join(rootDir, "apps/web/package.json")).href,
);

const MAX_BUILD_HEAP_MB = process.env.LOW_MEM_HEAP_MB || "520";

function runNodeStep(label, args, cwd, extraEnv = {}) {
  console.log(`\n🔨 [lowmem-build] ${label}...`);
  const existingNodeOpts = process.env.NODE_OPTIONS || "";
  const nodeOptions =
    `${existingNodeOpts} --max-old-space-size=${MAX_BUILD_HEAP_MB} --disable-warning=ExperimentalWarning`.trim();

  const res = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2",
      NEXT_TELEMETRY_DISABLED: "1",
      ...extraEnv,
    },
  });

  if (res.status !== 0) {
    throw new Error(`Falha na etapa "${label}" (exit code ${res.status ?? "unknown"})`);
  }
}

const tscSharedBin = requireFromShared.resolve("typescript/bin/tsc");
const tscApiBin = requireFromApi.resolve("typescript/bin/tsc");
const nextBin = requireFromWeb.resolve("next/dist/bin/next");

// 1. Build @pertufundos/shared (processo isolado -> libera RAM ao terminar)
runNodeStep("1/3 Compilando @pertufundos/shared", [tscSharedBin, "-p", "tsconfig.json"], path.join(rootDir, "packages/shared"));

// 2. Build @pertufundos/api + copia schema.sql (processo isolado -> libera RAM ao terminar)
runNodeStep("2/3 Compilando @pertufundos/api", [tscApiBin, "-p", "tsconfig.json"], path.join(rootDir, "apps/api"));
const schemaSrc = path.join(rootDir, "apps/api/src/infrastructure/persistence/postgres/schema.sql");
const schemaDestDir = path.join(rootDir, "apps/api/dist/infrastructure/persistence/postgres");
fs.mkdirSync(schemaDestDir, { recursive: true });
fs.copyFileSync(schemaSrc, path.join(schemaDestDir, "schema.sql"));

// 3. Limpa .next parcial/antigo e compila @pertufundos/web com 1 CPU, cache webpack desligado e heap limitado
fs.rmSync(path.join(rootDir, "apps/web/.next"), { recursive: true, force: true });
runNodeStep(
  "3/3 Compilando @pertufundos/web (modo baixo consumo de RAM)",
  [nextBin, "build"],
  path.join(rootDir, "apps/web"),
  {
    LOW_MEMORY_BUILD: "true",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "/api/v1",
  },
);

// Limpa cache de build do Next.js para economizar espaço em disco no container
fs.rmSync(path.join(rootDir, "apps/web/.next/cache"), { recursive: true, force: true });
console.log("\n✅ [lowmem-build] Build sequencial de baixo consumo concluído!");
