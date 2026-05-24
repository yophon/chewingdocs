import fs from "node:fs";
import path from "node:path";
import { readmeSeriesRows, repoRoot, seriesPageRows, siteSeriesRows } from "./series-utils.mjs";

const blocks = [
  {
    file: "README.md",
    start: "[series-table:start]: #",
    end: "[series-table:end]: #",
    content: [
      "| 系列 | 篇数 | 入口 |",
      "| --- | ---: | --- |",
      ...readmeSeriesRows()
    ].join("\n")
  },
  {
    file: "index.md",
    start: "[series-table:start]: #",
    end: "[series-table:end]: #",
    content: [
      "| 系列 | 入口 |",
      "| --- | --- |",
      ...siteSeriesRows()
    ].join("\n")
  },
  {
    file: "series.md",
    start: "[series-table:start]: #",
    end: "[series-table:end]: #",
    content: [
      "| 系列 | 阅读入口 |",
      "| --- | --- |",
      ...seriesPageRows()
    ].join("\n")
  }
];

function syncBlock({ file, start, end, content }) {
  const fullPath = path.join(repoRoot, file);
  const source = fs.readFileSync(fullPath, "utf8");
  const pattern = new RegExp(`(${escapeRegExp(start)}\\n)[\\s\\S]*?(\\n${escapeRegExp(end)})`);

  if (!pattern.test(source)) {
    throw new Error(`${file} is missing ${start} / ${end} markers`);
  }

  const next = source.replace(pattern, `$1\n${content}\n$2`);
  fs.writeFileSync(fullPath, next);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const block of blocks) {
  syncBlock(block);
}

console.log("Series tables synced");
