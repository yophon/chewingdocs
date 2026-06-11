import fs from "node:fs";
import path from "node:path";
import { series } from "../data/series.mjs";
import { chapterFiles, repoRoot } from "./series-utils.mjs";

const errors = [];

for (const { text, dir } of series) {
  const files = chapterFiles(dir);
  const plannedFiles = files.filter((file) => {
    const match = file.match(/^(\d+)-/);
    return !match || Number(match[1]) < 90;
  });
  const numbers = new Map();

  for (const file of files) {
    const match = file.match(/^(\d+)-/);
    if (!match) continue;

    const number = match[1];
    const bucket = numbers.get(number) ?? [];
    bucket.push(file);
    numbers.set(number, bucket);
  }

  for (const [number, duplicates] of numbers) {
    if (duplicates.length > 1) {
      errors.push(`${text}: duplicate chapter number ${number}: ${duplicates.join(", ")}`);
    }
  }

  const planPath = path.join(repoRoot, dir, "00-写作计划.md");
  if (!fs.existsSync(planPath)) continue;

  const plan = fs.readFileSync(planPath, "utf8");
  const explicitCount = plan.match(/共\s*(\d+)\s*篇/);
  if (explicitCount && Number(explicitCount[1]) !== plannedFiles.length) {
    errors.push(`${text}: plan says ${explicitCount[1]} chapters, actual ${plannedFiles.length}`);
  }

  const doneItems = [...plan.matchAll(/^- \[x\]\s+(\d+)\s+/gim)].map((match) => match[1]);
  if (doneItems.length > 0 && doneItems.length !== plannedFiles.length) {
    errors.push(`${text}: plan has ${doneItems.length} completed items, actual ${plannedFiles.length}`);
  }
}

if (errors.length > 0) {
  console.error("Series plan/count issues:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Series plan counts OK");
