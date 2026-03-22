import { homedir } from "node:os";
import { join } from "node:path";
import { IncidentData } from "./types.js";

export const DATA_DIR = join(homedir(), ".postmortem");

function formatDuration(started: string, resolved: string): string {
  const s = new Date(started).getTime();
  const r = new Date(resolved).getTime();
  if (isNaN(s) || isNaN(r) || r <= s) return "unknown";
  const diffMs = r - s;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remainMins}m`;
  return `${mins}m`;
}

export function generateReport(data: IncidentData): string {
  const date = new Date().toISOString().split("T")[0];
  const tagsLine = data.tags.length > 0 ? data.tags.join(", ") : "none";
  const duration = formatDuration(data.timeline.started, data.timeline.resolved);
  return `---
severity: ${data.severity}
status: ${data.status}
tags: ${tagsLine}
date: ${date}
started: ${data.timeline.started}
detected: ${data.timeline.detected}
resolved: ${data.timeline.resolved}
---

# Incident Report — ${date}

**Severity:** ${data.severity}
**Status:** ${data.status}
**Tags:** ${tagsLine}

## Timeline
| Event | Time |
|-------|------|
| Started | ${data.timeline.started} |
| Detected | ${data.timeline.detected} |
| Resolved | ${data.timeline.resolved} |
| **Duration** | **${duration}** |

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
