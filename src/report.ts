import { homedir } from "node:os";
import { join } from "node:path";
import { IncidentData } from "./types.js";

export const DATA_DIR = join(homedir(), ".postmortem");

export function generateReport(data: IncidentData): string {
  const date = new Date().toISOString().split("T")[0];
  const tagsLine = data.tags.length > 0 ? data.tags.join(", ") : "none";
  return `---
severity: ${data.severity}
tags: ${tagsLine}
date: ${date}
---

# Incident Report — ${date}

**Severity:** ${data.severity}
**Tags:** ${tagsLine}

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
