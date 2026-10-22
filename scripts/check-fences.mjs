import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const excludedDirs = new Set([".git", ".obsidian", ".venv", "docs", "node_modules", "site"]);
const errors = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) files.push(...walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Follows CommonMark: a fence closes only on the same character, at least as long, with no info string.
// An opener with an info string inside an open fence of the same length means a nested block that
// needs a longer outer fence (````); otherwise the outer block ends early and the rest of the page flips.
function checkFences(file, source) {
  const relFile = path.relative(root, file);
  let open = null;

  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) return;

    const [, fence, rest] = match;
    const char = fence[0];
    const info = rest.trim();
    if (char === "`" && rest.includes("`")) return;

    if (!open) {
      open = { char, length: fence.length, line: index + 1 };
      return;
    }
    if (char !== open.char || fence.length < open.length) return;

    if (info === "") {
      open = null;
    } else {
      errors.push(`${relFile}:${index + 1} nested fence inside block opened at line ${open.line}; widen the outer fence`);
    }
  });

  if (open) errors.push(`${relFile}:${open.line} code fence is never closed`);
}

for (const file of walk(root)) {
  checkFences(file, fs.readFileSync(file, "utf8"));
}

if (errors.length) {
  console.error("Markdown code fence issues:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Markdown code fences OK");
