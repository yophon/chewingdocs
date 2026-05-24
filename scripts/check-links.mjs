import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const excludedDirs = new Set([".git", ".obsidian", ".venv", "docs", "node_modules", "site"]);
const errors = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && excludedDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) files.push(...walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectLinks(source) {
  const links = [];
  const lines = source.split(/\r?\n/);
  let inFence = false;

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const withoutInlineCode = line.replace(/`[^`]*`/g, "");
    const linkPattern = /!?\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;
    while ((match = linkPattern.exec(withoutInlineCode))) {
      if (!match[0].startsWith("!")) links.push({ href: match[1], line: index + 1 });
    }
  });

  return links;
}

function stripHashAndQuery(value) {
  return value.split("#")[0].split("?")[0];
}

function candidatePaths(fromFile, href) {
  const cleanHref = decodeURI(stripHashAndQuery(href));
  if (!cleanHref || cleanHref.startsWith("#")) return [];
  if (/^(https?:|mailto:|tel:|ftp:|javascript:)/i.test(cleanHref)) return [];

  const base = cleanHref.startsWith("/")
    ? path.join(root, cleanHref)
    : path.resolve(path.dirname(fromFile), cleanHref);

  const candidates = [base];
  if (!path.extname(base)) {
    candidates.push(`${base}.md`, path.join(base, "index.md"));
  }
  return candidates;
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, "utf8");
  for (const { href, line } of collectLinks(source)) {
    const candidates = candidatePaths(file, href);
    if (candidates.length && !candidates.some((candidate) => fs.existsSync(candidate))) {
      const relFile = path.relative(root, file);
      const suffix = line ? `:${line}` : "";
      errors.push(`${relFile}${suffix} -> ${href}`);
    }
  }
}

if (errors.length) {
  console.error("Broken local Markdown links:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Local Markdown links OK");
