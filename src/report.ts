import { homedir } from "node:os";
import { join } from "node:path";
import { IncidentData } from "./types.js";

export const DATA_DIR = join(homedir(), ".postmortem");

export function generateReport(data: IncidentData): string {
  const date = new Date().toISOString().split("T")[0];
  return `# Incident Report — ${date}

## Summary
${data.summary}

## Impact
${data.impact}

## Root Cause
${data.rootCause}

## Detection Failure
${data.detectionFailure}

## Prevention
${data.prevention}
`;
}

export function getOutputPath(slug?: string): string {
  const date = new Date().toISOString().split("T")[0];
  const name = slug
    ? slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    : "incident";
  return join(DATA_DIR, `${date}-${name}.md`);
}
