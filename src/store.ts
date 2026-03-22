import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { DATA_DIR } from "./report.js";

export interface StoredReport {
  filename: string;
  path: string;
  date: string;
  severity: string;
  status: string;
  tags: string[];
  title: string;
  content: string;
  started: string;
  detected: string;
  resolved: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2] };
}

export function listReports(): StoredReport[] {
  let files: string[];
  try {
    files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".md")).sort().reverse();
  } catch {
    return [];
  }

  return files.map((f) => {
    const path = join(DATA_DIR, f);
    const raw = readFileSync(path, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const titleMatch = body.match(/^# (.+)$/m);
    return {
      filename: f,
      path,
      date: meta.date || f.slice(0, 10),
      severity: meta.severity || "unknown",
      status: meta.status || "open",
      tags: meta.tags ? meta.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      title: titleMatch ? titleMatch[1] : basename(f, ".md"),
      content: raw,
      started: meta.started || "",
      detected: meta.detected || "",
      resolved: meta.resolved || "",
    };
  });
}

export function findReport(query: string): StoredReport | undefined {
  const reports = listReports();
  return reports.find(
    (r) => r.filename === query || r.filename === `${query}.md` || r.filename.includes(query)
  );
}

export function searchReports(query: string): StoredReport[] {
  const q = query.toLowerCase();
  return listReports().filter(
    (r) => r.content.toLowerCase().includes(q) || r.filename.toLowerCase().includes(q)
  );
}

export function updateFrontmatter(report: StoredReport, fields: Record<string, string>): void {
  const raw = readFileSync(report.path, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return;

  const lines = match[1].split("\n");
  for (const [key, value] of Object.entries(fields)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (idx >= 0) {
      lines[idx] = `${key}: ${value}`;
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  writeFileSync(report.path, `---\n${lines.join("\n")}\n---\n${match[2]}`, "utf-8");
}
