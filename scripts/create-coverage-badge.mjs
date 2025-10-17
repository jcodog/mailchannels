import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SUMMARY_PATH = path.resolve("coverage/coverage-summary.json");
const BADGE_PATH = path.resolve("coverage/badge.json");

async function main() {
  const raw = await readFile(SUMMARY_PATH, "utf8");
  const summary = JSON.parse(raw);
  const totals = summary.total ?? {};

  const metrics = ["statements", "branches", "functions", "lines"];
  const percentages = metrics.map((metric) => Number(totals[metric]?.pct ?? 0));
  const minPercentage = Math.min(...percentages);

  const formatPercentage = (value) => value.toFixed(2).replace(/\.00$/, "");

  const badge = {
    schemaVersion: 1,
    label: "coverage",
    message: `${formatPercentage(minPercentage)}%`,
    color:
      minPercentage >= 100
        ? "brightgreen"
        : minPercentage >= 90
        ? "green"
        : "yellowgreen",
    labelColor: "1f2937",
    namedLogo: "vitest",
    style: "flat",
  };

  await writeFile(BADGE_PATH, JSON.stringify(badge, null, 2), "utf8");
}

main().catch((error) => {
  console.error("Failed to create coverage badge", error);
  process.exitCode = 1;
});
