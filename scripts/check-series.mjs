import fs from "node:fs";
import path from "node:path";
import { readmeSeriesRows, repoRoot, seriesPageRows, siteSeriesRows } from "./series-utils.mjs";

const checks = [
  {
    file: "README.md",
    start: "[series-table:start]: #",
    end: "[series-table:end]: #",
    expected: [
      "| 系列 | 篇数 | 入口 |",
      "| --- | ---: | --- |",
      ...readmeSeriesRows()
    ].join("\n")
  },
  {
    file: "index.md",
    start: "[series-table:start]: #",
    end: "[series-table:end]: #",
    expected: [
      "| 系列 | 入口 |",
      "| --- | --- |",
      ...siteSeriesRows()
    ].join("\n")
  },
  {
    file: "series.md",
    start: "[series-table:start]: #",
    end: "[series-table:end]: #",
    expected: [
      "| 系列 | 阅读入口 |",
      "| --- | --- |",
      ...seriesPageRows()
    ].join("\n")
  }
];

const failures = [];

for (const check of checks) {
  const actual = readBlock(check);
  if (actual !== check.expected) {
    failures.push(check.file);
  }
}

if (failures.length > 0) {
  console.error(`Series tables are stale: ${failures.join(", ")}`);
  console.error("Run: npm run docs:sync-series");
  process.exit(1);
}

console.log("Series tables OK");

function readBlock({ file, start, end }) {
  const fullPath = path.join(repoRoot, file);
  const source = fs.readFileSync(fullPath, "utf8");
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    failures.push(`${file} (missing markers)`);
    return "";
  }

  return source.slice(startIndex + start.length, endIndex).trim();
}
