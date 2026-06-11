import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const excludedDirs = new Set([".git", ".obsidian", ".venv", "docs", "node_modules", "site"]);
const defaultDirs = [
  "aiLearning",
  "aiInfraLearning",
  "claudeLearning",
  "webLearning",
  "androidNativeLearning",
  "androidPlatformLearning",
  "iosNativeLearning",
  "flutterLearning",
  "mobileCommonLearning",
  "devopsLearning",
  "cloudBasicsLearning",
  "securityLearning"
];

const keywords = [
  "最新",
  "当前",
  "现在",
  "主流",
  "推荐",
  "事实标准",
  "target SDK",
  "Xcode",
  "Kubernetes",
  "React",
  "Vue",
  "Vite",
  "vLLM",
  "SGLang",
  "TensorRT-LLM",
  "Claude Code",
  "MCP",
  "App Store",
  "Google Play"
];

const limit = Number(process.env.REVIEW_AUDIT_LIMIT ?? 120);
const dirs = process.argv.slice(2);
const roots = (dirs.length ? dirs : defaultDirs).map((dir) => path.join(root, dir));
const pattern = new RegExp(keywords.map(escapeRegExp).join("|"), "i");
const findings = [];

for (const start of roots) {
  if (fs.existsSync(start)) walk(start);
}

for (const finding of findings.slice(0, limit)) {
  console.log(`${finding.file}:${finding.line}: ${finding.text}`);
}

if (findings.length > limit) {
  console.log(`... ${findings.length - limit} more matches. Set REVIEW_AUDIT_LIMIT to show more.`);
}

console.log(`Review keyword matches: ${findings.length}`);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && excludedDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) walk(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    scanFile(fullPath);
  }
}

function scanFile(file) {
  const rel = path.relative(root, file);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!pattern.test(line)) return;
    findings.push({
      file: rel,
      line: index + 1,
      text: line.trim().slice(0, 180)
    });
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
