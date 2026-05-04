// scripts/build.js
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const DIST_DIR = path.join(ROOT, "dist");
const BASE_TEMPLATE_PATH = path.join(ROOT, "templates", "base.html");
const APP_TEMPLATE_PATH = path.join(ROOT, "templates", "app.html");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function emptyDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function applyIncludes(html) {
  return html.replace(/<!--#include file="([^"]+)" -->/g, (_, includePath) => {
    const normalized = includePath.replace(/^\//, "");
    const full = path.join(ROOT, normalized);
    if (!fs.existsSync(full)) throw new Error(`Missing include: ${includePath}`);
    return read(full);
  });
}

function walkHtml(dir, files = []) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkHtml(full, files);
    else if (item.endsWith(".html")) files.push(full);
  }
  return files;
}

function pageMeta(relPath) {
  const depth = relPath.split(/[\\/]/).length - 1;
  const ROOT_PATH = depth === 0 ? "" : "../".repeat(depth);

  return {
    TITLE: "Where Did That Start?",
    DESCRIPTION:
      "The history of weird trends, habits, fashion, sayings, and modern madness.",
    PAGE: relPath.replace(/\\/g, "/"),
    ROOT_PATH,
  };
}
function buildPage(pagePath) {
  const rel = path.relative(SRC_DIR, pagePath).replace(/\\/g, "/");
  const outPath = path.join(DIST_DIR, rel);

  const templatePath = rel.startsWith("app/")
    ? APP_TEMPLATE_PATH
    : BASE_TEMPLATE_PATH;

  const base = read(templatePath);
  const content = read(pagePath);
  const meta = pageMeta(rel);

 let merged = base
  .replaceAll("{{TITLE}}", meta.TITLE)
  .replaceAll("{{DESCRIPTION}}", meta.DESCRIPTION)
  .replaceAll("{{PAGE}}", meta.PAGE)
  .replaceAll("{{ROOT_PATH}}", meta.ROOT_PATH)
  .replace("{{CONTENT}}", content);
  merged = applyIncludes(merged);
  write(outPath, merged);
}

(function main() {
  emptyDir(DIST_DIR);

  // Copy shared static folders from repo root into dist
  for (const folder of ["css", "assets", "js"]) {
    const p = path.join(ROOT, folder);
    if (fs.existsSync(p)) copyDir(p, path.join(DIST_DIR, folder));
  }

  // Copy selected root static files into dist (if present)
  for (const file of ["favicon.ico", "site.webmanifest", "robots.txt", "sitemap.xml"]) {
    const srcFile = path.join(ROOT, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(DIST_DIR, file));
    }
  }

  if (!fs.existsSync(SRC_DIR)) {
    console.error(
      `Build failed: missing /src directory at ${SRC_DIR}. ` +
      `Create /src and add at least /src/index.html (content-only).`
    );
    process.exit(1);
  }

  const pages = walkHtml(SRC_DIR);

  if (pages.length === 0) {
    console.error(
      "Build failed: /src contains no .html files. Add at least /src/index.html."
    );
    process.exit(1);
  }

  pages.forEach(buildPage);
  console.log(`Built ${pages.length} pages to /dist`);
})();