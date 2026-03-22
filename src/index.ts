#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { input, select } from "@inquirer/prompts";
import { Command } from "commander";
import { IncidentData, Severity } from "./types.js";
import { generateReport, getOutputPath } from "./report.js";

const program = new Command();

program
  .name("postmortem")
  .description("Document incidents and extract learnings")
  .version("1.0.0")
  .option("--summary <text>", "What broke?")
  .option("--impact <text>", "What was the impact?")
  .option("--root-cause <text>", "What was the root cause?")
  .option("--detection <text>", "Why was it not detected?")
  .option("--prevention <text>", "What will prevent it?")
  .option("--severity <level>", "Severity: critical, major, minor", "major")
  .option("--tags <tags>", "Comma-separated tags (e.g. deploy,database)")
  .option("--slug <name>", "Short name for the file (e.g. 'api-outage')")
  .option("-o, --output <path>", "Custom output path (overrides default)")
  .option("--stdout", "Print report to stdout instead of saving to file")
  .action(run);

program.parse();

async function run(opts: Record<string, string | boolean | undefined>) {
  const isNonInteractive =
    opts.summary && opts.impact && opts.rootCause && opts.detection && opts.prevention;

  let data: IncidentData;

  if (isNonInteractive) {
    const tags = opts.tags
      ? (opts.tags as string).split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    data = {
      summary: opts.summary as string,
      impact: opts.impact as string,
      rootCause: opts.rootCause as string,
      detectionFailure: opts.detection as string,
      prevention: opts.prevention as string,
      severity: (opts.severity as Severity) || "major",
      tags,
    };
  } else {
    try {
      data = await promptInteractive();
    } catch (err) {
      if (err instanceof Error && err.name === "ExitPromptError") {
        process.exit(0);
      }
      throw err;
    }
  }

  const report = generateReport(data);

  if (opts.stdout) {
    process.stdout.write(report);
    return;
  }

  const outPath =
    (opts.output as string) || getOutputPath(opts.slug as string | undefined);
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, report, "utf-8");
  console.log(`Saved: ${outPath}`);
}

async function promptInteractive(): Promise<IncidentData> {
  const severity = await select<Severity>({
    message: "Severity?",
    choices: [
      { value: "critical", name: "critical" },
      { value: "major", name: "major" },
      { value: "minor", name: "minor" },
    ],
    default: "major",
  });
  const summary = await input({ message: "What broke?" });
  const impact = await input({ message: "What was the impact?" });
  const rootCause = await input({ message: "What was the root cause?" });
  const detectionFailure = await input({ message: "Why was it not detected?" });
  const prevention = await input({ message: "What will prevent it?" });
  const tagsRaw = await input({ message: "Tags? (comma-separated, or leave empty)" });
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  return { summary, impact, rootCause, detectionFailure, prevention, severity, tags };
}
