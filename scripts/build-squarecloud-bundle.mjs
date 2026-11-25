import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "deploy-squarecloud");
const zipPath = path.join(rootDir, "pertufundos-squarecloud.zip");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function copyDir(src, dest, filter = () => true) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (!filter(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("1/3 Executando build econômico compartilhado...");
execSync("node scripts/lowmem-build.mjs", { cwd: rootDir, stdio: "inherit" });

console.log("2/3 Montando pacote pré-compilado em deploy-squarecloud/...");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.copyFileSync(path.join(rootDir, "squarecloud.app"), path.join(outDir, "squarecloud.app"));
fs.copyFileSync(path.join(rootDir, "server.mjs"), path.join(outDir, "server.mjs"));
fs.mkdirSync(path.join(outDir, "scripts"), { recursive: true });
fs.copyFileSync(
  path.join(rootDir, "scripts/lowmem-build.mjs"),
  path.join(outDir, "scripts/lowmem-build.mjs"),
);

const rootPkg = readJson(path.join(rootDir, "package.json"));
fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify(rootPkg, null, 2));

for (const pkgRel of ["packages/shared", "apps/api", "apps/web"]) {
  const pkgSrc = path.join(rootDir, pkgRel);
  const pkgDest = path.join(outDir, pkgRel);
  fs.mkdirSync(pkgDest, { recursive: true });
  fs.copyFileSync(path.join(pkgSrc, "package.json"), path.join(pkgDest, "package.json"));
  if (fs.existsSync(path.join(pkgSrc, "dist"))) {
    copyDir(path.join(pkgSrc, "dist"), path.join(pkgDest, "dist"));
  }
  if (fs.existsSync(path.join(pkgSrc, ".next"))) {
    copyDir(
      path.join(pkgSrc, ".next"),
      path.join(pkgDest, ".next"),
      (s) => !s.includes(`${path.sep}cache${path.sep}`) && !s.endsWith(`${path.sep}cache`),
    );
  }
  if (fs.existsSync(path.join(pkgSrc, "next.config.mjs"))) {
    fs.copyFileSync(path.join(pkgSrc, "next.config.mjs"), path.join(pkgDest, "next.config.mjs"));
  }
}

console.log("3/3 Compactando ZIP...");
if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
const pyZipScript = [
  "import os, zipfile",
  `root = r'''${outDir}'''`,
  `dest = r'''${zipPath}'''`,
  "with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zf:",
  "  for dirpath, _, filenames in os.walk(root):",
  "    for fn in filenames:",
  "      full = os.path.join(dirpath, fn)",
  "      rel = os.path.relpath(full, root).replace('\\\\', '/')",
  "      zf.write(full, rel)",
].join("\n");
const tmpPy = path.join(rootDir, ".tmp-make-zip.py");
fs.writeFileSync(tmpPy, pyZipScript);
try {
  execSync(`python "${tmpPy}"`, { stdio: "inherit" });
} finally {
  fs.rmSync(tmpPy, { force: true });
}

const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
console.log(`✅ Pacote pronto: ${zipPath} (${sizeMb} MB)`);
