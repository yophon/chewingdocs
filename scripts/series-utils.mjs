import fs from "node:fs";
import path from "node:path";
import { series } from "../data/series.mjs";

export const repoRoot = path.resolve(import.meta.dirname, "..");

export function stripExt(file) {
  return file.replace(/\.md$/, "");
}

export function titleFromFile(file) {
  return stripExt(file).replace(/^(\d+)-/, "$1. ");
}

export function displayTitleFromFile(file) {
  if (file === "00-写作计划.md") return "写作计划";
  return titleFromFile(file).replace(/^\d+\.\s*/, "");
}

export function chapterFiles(dir, { includePlans = false } = {}) {
  const fullDir = path.join(repoRoot, dir);
  if (!fs.existsSync(fullDir)) return [];

  return fs
    .readdirSync(fullDir)
    .filter((file) => file.endsWith(".md"))
    .filter((file) => includePlans || file !== "00-写作计划.md")
    .filter((file) => file !== "目录.md")
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
}

export function firstReadableFile(dir) {
  const chapters = chapterFiles(dir);
  if (chapters[0]) return chapters[0];

  const planFile = "00-写作计划.md";
  const planPath = path.join(repoRoot, dir, planFile);
  return fs.existsSync(planPath) ? planFile : null;
}

export function firstReadableLink(dir, { extension = false, absolute = true } = {}) {
  const file = firstReadableFile(dir);
  const suffix = extension ? ".md" : "";
  const prefix = absolute ? "/" : "";

  if (!file) return `${prefix}${dir}/`;
  return `${prefix}${dir}/${stripExt(file)}${suffix}`;
}

export function readmeSeriesRows() {
  return series.map(({ text, dir }) => {
    const count = chapterFiles(dir).length;
    return `| ${text} | ${count} | [${dir}](${firstReadableLink(dir, { extension: true, absolute: false })}) |`;
  });
}

export function siteSeriesRows() {
  return series.map(({ text, dir }) => `| ${text} | [${dir}](${firstReadableLink(dir)}) |`);
}

export function seriesPageRows() {
  return series.map(({ text, dir, planTitle }) => {
    const file = firstReadableFile(dir);
    const title = file === "00-写作计划.md" && planTitle ? planTitle : file ? displayTitleFromFile(file) : dir;
    return `| ${text} | [${title}](${firstReadableLink(dir)}) |`;
  });
}
