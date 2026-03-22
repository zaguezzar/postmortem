#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { input, select } from "@inquirer/prompts";
import { Command } from "commander";
import { IncidentData, Severity, Status } from "./types.js";
import { generateReport, getOutputPath } from "./report.js";
import { listReports, findReport, searchReports } from "./store.js";
import { launchTUI } from "./ui.js";

const program = new Command();

program
  .name("postmortem")
  .description("Document incidents and extract learnings")
  .version("1.0.0")
  .action(() => {
    launchTUI();
  });

program
  .command("new")
  .description("Create a new incident report")
  .option("--summary <text>", "What broke?")
  .option("--impact <text>", "What was the impact?")
  .option("--root-cause <text>", "What was the root cause?")
  .option("--detection <text>", "Why was it not detected?")
  .option("--prevention <text>", "What will prevent it?")
  .option("--severity <level>", "Severity: critical, major, minor", "major")
  .option("--status <status>", "Status: open, action-items-pending, resolved", "open")
  .option("--started <time>", "When the incident started (e.g. 2026-03-22T14:00)")
  .option("--detected <time>", "When the incident was detected")
  .option("--resolved <time>", "When the incident was resolved")
  .option("--tags <tags>", "Comma-separated tags (e.g. deploy,database)")
  .option("--slug <name>", "Short name for the file (e.g. 'api-outage')")
  .option("-o, --output <path>", "Custom output path (overrides default)")
  .option("--stdout", "Print report to stdout instead of saving to file")
  .action(runNew);

program
  .command("list")
  .alias("ls")
  .description("List all incident reports")
  .option("--severity <level>", "Filter by severity")
  .option("--status <status>", "Filter by status")
  .option("--tag <tag>", "Filter by tag")
  .action(runList);

program
  .command("show <name>")
  .description("Show a specific report")
  .action(runShow);

program
  .command("edit <name>")
  .description("Open a report in $EDITOR")
  .action(runEdit);

program
  .command("search <query>")
  .alias("grep")
  .description("Search across all reports")
  .action(runSearch);

program.parse();

// --- Command handlers ---

async function runNew(opts: Record<string, string | boolean | undefined>) {
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
      status: (opts.status as Status) || "open",
      tags,
      timeline: {
        started: (opts.started as string) || "",
        detected: (opts.detected as string) || "",
        resolved: (opts.resolved as string) || "",
      },
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

function runList(opts: { severity?: string; status?: string; tag?: string }) {
  let reports = listReports();

  if (opts.severity) {
    reports = reports.filter((r) => r.severity === opts.severity);
  }
  if (opts.status) {
    reports = reports.filter((r) => r.status === opts.status);
  }
  if (opts.tag) {
    reports = reports.filter((r) => r.tags.includes(opts.tag!));
  }

  if (reports.length === 0) {
    console.log("No reports found.");
    return;
  }

  const severityColor: Record<string, string> = {
    critical: "\x1b[31m",
    major: "\x1b[33m",
    minor: "\x1b[32m",
  };
  const statusIcon: Record<string, string> = {
    open: "\x1b[31m●\x1b[0m",
    "action-items-pending": "\x1b[33m●\x1b[0m",
    resolved: "\x1b[32m●\x1b[0m",
  };
  const reset = "\x1b[0m";

  for (const r of reports) {
    const color = severityColor[r.severity] || "";
    const icon = statusIcon[r.status] || "○";
    const tags = r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : "";
    console.log(`${icon} ${r.date}  ${color}${r.severity.padEnd(9)}${reset} ${r.filename}${tags}`);
  }
}

function runShow(name: string) {
  const report = findReport(name);
  if (!report) {
    console.error(`Report not found: ${name}`);
    process.exit(1);
  }
  process.stdout.write(report.content);
}

function runEdit(name: string) {
  const report = findReport(name);
  if (!report) {
    console.error(`Report not found: ${name}`);
    process.exit(1);
  }
  const editor = process.env.EDITOR || "vi";
  execSync(`${editor} "${report.path}"`, { stdio: "inherit" });
}

function runSearch(query: string) {
  const results = searchReports(query);
  if (results.length === 0) {
    console.log(`No results for "${query}".`);
    return;
  }

  for (const r of results) {
    console.log(`\x1b[1m${r.filename}\x1b[0m`);
    // Show matching lines
    const lines = r.content.split("\n");
    const q = query.toLowerCase();
    for (const line of lines) {
      if (line.toLowerCase().includes(q)) {
        const highlighted = line.replace(
          new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
          "\x1b[33m$1\x1b[0m"
        );
        console.log(`  ${highlighted}`);
      }
    }
    console.log();
  }
}

// --- Interactive prompts ---

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
  const status = await select<Status>({
    message: "Status?",
    choices: [
      { value: "open", name: "open" },
      { value: "action-items-pending", name: "action-items-pending" },
      { value: "resolved", name: "resolved" },
    ],
    default: "open",
  });
  const started = await input({ message: "When did it start? (e.g. 2026-03-22T14:00)" });
  const detected = await input({ message: "When was it detected?" });
  const resolved = await input({ message: "When was it resolved?" });
  const summary = await input({ message: "What broke?" });
  const impact = await input({ message: "What was the impact?" });
  const rootCause = await input({ message: "What was the root cause?" });
  const detectionFailure = await input({ message: "Why was it not detected?" });
  const prevention = await input({ message: "What will prevent it?" });
  const tagsRaw = await input({ message: "Tags? (comma-separated, or leave empty)" });
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  return {
    summary, impact, rootCause, detectionFailure, prevention,
    severity, status, tags,
    timeline: { started, detected, resolved },
  };
}
