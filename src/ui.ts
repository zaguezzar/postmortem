import blessed from "blessed";
import { mkdirSync, unlinkSync, existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { listReports, StoredReport, updateFrontmatter } from "./store.js";
import { generateReport, getOutputPath } from "./report.js";
import type { IncidentData, Severity } from "./types.js";

// Tokyo Night color scheme (matching focus)
const C = {
  bg: "#1a1b26",
  fg: "#c0caf5",
  border: "#3b4261",
  headerBg: "#24283b",
  selectedBg: "#283457",
  accent: "#bb9af7",
  dimFg: "#565f89",
  inputBg: "#1f2335",
  red: "#f7768e",
  yellow: "#e0af68",
  green: "#9ece6a",
  blue: "#7aa2f7",
};

const severityColors: Record<string, string> = {
  critical: C.red,
  major: C.yellow,
  minor: C.green,
};

const statusColors: Record<string, string> = {
  open: C.red,
  "action-items-pending": C.yellow,
  resolved: C.green,
};

export function launchTUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "postmortem",
    fullUnicode: true,
    mouse: true,
  });

  let reports = listReports();
  let filtered = [...reports];
  let selectedIdx = 0;
  let searchQuery = "";
  let filterSeverity = "";
  let filterStatus = "";

  type FilterTab = "all" | "critical" | "major" | "minor" | "open" | "pending" | "resolved";
  const TABS: FilterTab[] = ["all", "critical", "major", "minor", "open", "pending", "resolved"];
  let activeTab: FilterTab = "all";

  function applyTab(tab: FilterTab) {
    activeTab = tab;
    if (tab === "all") {
      filterSeverity = "";
      filterStatus = "";
    } else if (tab === "critical" || tab === "major" || tab === "minor") {
      filterSeverity = tab;
      filterStatus = "";
    } else if (tab === "pending") {
      filterSeverity = "";
      filterStatus = "action-items-pending";
    } else {
      filterSeverity = "";
      filterStatus = tab;
    }
  }

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    style: { bg: C.headerBg, fg: C.fg },
    tags: true,
  });

  // Left panel: incident list (box, not list widget — avoids focus stealing)
  const listPanel = blessed.box({
    top: 3,
    left: 0,
    width: "45%",
    bottom: 3,
    border: { type: "line" },
    style: { border: { fg: C.border }, bg: C.bg, fg: C.fg },
    tags: true,
    scrollable: true,
    mouse: true,
    label: " Incidents ",
  });

  // Right panel: detail view
  const detailPanel = blessed.box({
    top: 3,
    left: "45%",
    width: "55%",
    bottom: 3,
    border: { type: "line" },
    padding: { left: 2, right: 2, top: 0, bottom: 0 },
    style: { border: { fg: C.border }, bg: C.bg, fg: C.fg },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    label: " Details ",
  });

  // Status bar
  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    style: { bg: C.headerBg, fg: C.dimFg },
    tags: true,
  });

  screen.append(header);
  screen.append(listPanel);
  screen.append(detailPanel);
  screen.append(statusBar);

  // --- Helpers ---

  function row(label: string, value: string): string {
    const pad = 12 - label.length;
    return `{${C.dimFg}-fg}${label}{/}${" ".repeat(Math.max(1, pad))}${value}`;
  }

  function applyFilters() {
    filtered = reports.filter((r) => {
      if (filterSeverity && r.severity !== filterSeverity) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.content.toLowerCase().includes(q) || r.filename.toLowerCase().includes(q);
      }
      return true;
    });
    if (selectedIdx >= filtered.length) selectedIdx = Math.max(0, filtered.length - 1);
  }

  function tabCount(tab: FilterTab): number {
    if (tab === "all") return reports.length;
    if (tab === "critical" || tab === "major" || tab === "minor") {
      return reports.filter((r) => r.severity === tab).length;
    }
    const status = tab === "pending" ? "action-items-pending" : tab;
    return reports.filter((r) => r.status === status).length;
  }

  function tabColor(tab: FilterTab): string {
    if (tab === "critical") return C.red;
    if (tab === "major") return C.yellow;
    if (tab === "minor") return C.green;
    if (tab === "open") return C.red;
    if (tab === "pending") return C.yellow;
    if (tab === "resolved") return C.green;
    return C.fg;
  }

  function renderHeader() {
    const tabs = TABS.map((tab) => {
      const count = tabCount(tab);
      const color = tabColor(tab);
      if (tab === activeTab) {
        return `{${color}-fg}{bold} [${tab.toUpperCase()}] (${count}) {/bold}{/}`;
      }
      return `{${C.dimFg}-fg} ${tab} (${count}) {/}`;
    }).join(" ");

    let searchInfo = "";
    if (searchQuery) searchInfo = `  {${C.accent}-fg}/${searchQuery}{/}`;

    header.setContent(
      `\n {${C.accent}-fg}{bold}POSTMORTEM{/bold}{/}  ${tabs}${searchInfo}`
    );
  }

  function renderList() {
    if (filtered.length === 0) {
      listPanel.setContent(`\n  {${C.dimFg}-fg}No incidents found.{/}`);
      return;
    }

    const lines = filtered.map((r, i) => {
      const selected = i === selectedIdx;
      const prefix = selected ? `{${C.selectedBg}-bg}` : "";
      const suffix = selected ? "{/}" : "";
      const cursor = selected ? "{bold}>{/bold}" : " ";

      const statusColor = statusColors[r.status] || C.dimFg;
      const icon = `{${statusColor}-fg}\u25CF{/}`;

      const sevColor = severityColors[r.severity] || C.fg;
      const sev = `{${sevColor}-fg}${r.severity.padEnd(9)}{/}`;

      const slug = r.filename.replace(/\.md$/, "").slice(11);
      const tags = r.tags.length > 0
        ? ` {${C.yellow}-fg}${r.tags.map((t) => "#" + t).join(" ")}{/}`
        : "";

      return `${prefix} ${cursor} ${icon} ${sev} {${C.dimFg}-fg}${r.date}{/} ${slug}${tags} ${suffix}`;
    });

    listPanel.setContent("\n" + lines.join("\n"));
  }

  function renderDetail() {
    if (filtered.length === 0) {
      detailPanel.setContent(`{${C.dimFg}-fg}No incident selected{/}`);
      return;
    }

    const r = filtered[selectedIdx];
    const lines: string[] = [];

    // Title
    const slug = r.filename.replace(/\.md$/, "").slice(11);
    lines.push(`{bold}{${C.fg}-fg}${slug}{/bold}{/}`);
    lines.push("");

    // Metadata
    const sevColor = severityColors[r.severity] || C.fg;
    const statColor = statusColors[r.status] || C.fg;
    lines.push(row("Severity:", `{${sevColor}-fg}${r.severity}{/}`));
    lines.push(row("Status:", `{${statColor}-fg}${r.status}{/}`));
    lines.push(row("Date:", r.date));

    if (r.tags.length > 0) {
      lines.push(row("Tags:", `{${C.yellow}-fg}${r.tags.map((t) => "#" + t).join(" ")}{/}`));
    }

    // Timeline
    if (r.started || r.detected || r.resolved) {
      lines.push("");
      lines.push(`{${C.dimFg}-fg}--- Timeline ---{/}`);
      if (r.started) lines.push(row("Started:", r.started));
      if (r.detected) lines.push(row("Detected:", r.detected));
      if (r.resolved) lines.push(row("Resolved:", r.resolved));

      if (r.started && r.resolved) {
        const s = new Date(r.started).getTime();
        const e = new Date(r.resolved).getTime();
        if (!isNaN(s) && !isNaN(e) && e > s) {
          const mins = Math.floor((e - s) / 60000);
          const hrs = Math.floor(mins / 60);
          const rem = mins % 60;
          const dur = hrs > 0 ? `${hrs}h ${rem}m` : `${mins}m`;
          lines.push(row("Duration:", `{${C.accent}-fg}${dur}{/}`));
        }
      }
    }

    // Sections from the report body
    const body = r.content.replace(/^---\n[\s\S]*?\n---\n/, "").trim();

    const sections: { name: string; content: string }[] = [];
    const sectionRegex = /^## (.+)$/gm;
    let match;
    const matches: { name: string; start: number }[] = [];
    while ((match = sectionRegex.exec(body)) !== null) {
      matches.push({ name: match[1], start: match.index + match[0].length });
    }
    for (let i = 0; i < matches.length; i++) {
      const end = i + 1 < matches.length ? matches[i + 1].start - matches[i + 1].name.length - 3 : body.length;
      const content = body.slice(matches[i].start, end).trim();
      sections.push({ name: matches[i].name, content });
    }

    for (const section of sections) {
      if (section.name === "Timeline") continue; // Already rendered above
      lines.push("");
      lines.push(`{${C.dimFg}-fg}--- ${section.name} ---{/}`);

      // Handle action items specially
      if (section.name === "Action Items") {
        for (const line of section.content.split("\n")) {
          const doneMatch = line.match(/^- \[x\] (.+)$/);
          const todoMatch = line.match(/^- \[ \] (.+)$/);
          if (doneMatch) {
            lines.push(` {${C.green}-fg}\u2714{/} {${C.dimFg}-fg}${doneMatch[1]}{/}`);
          } else if (todoMatch) {
            lines.push(` {${C.red}-fg}\u25CB{/} ${todoMatch[1]}`);
          } else if (line.trim()) {
            lines.push(` ${line.trim()}`);
          }
        }
      } else {
        for (const line of section.content.split("\n")) {
          if (line.trim()) lines.push(` ${line.trim()}`);
        }
      }
    }

    detailPanel.setContent("\n" + lines.join("\n"));
    detailPanel.scrollTo(0);
  }

  function renderStatusBar() {
    const k = (key: string) => `{${C.accent}-fg}[${key}]{/}`;
    const l = (text: string) => `{${C.fg}-fg}${text}{/}`;

    const line1 = ` ${k("j/k")} ${l("nav")}  ${k("Tab")} ${l("filter")}  ${k("n")} ${l("new")}  ${k("r")} ${l("status")}  ` +
      `${k("t")} ${l("timeline")}  ${k("x")} ${l("severity")}  ${k("g")} ${l("tags")}  ` +
      `${k("e")} ${l("edit")}  ${k("d")} ${l("delete")}  ${k("q")} ${l("quit")}`;

    // Summary counts
    const openCount = reports.filter((r) => r.status === "open").length;
    const pendingCount = reports.filter((r) => r.status === "action-items-pending").length;
    const resolvedCount = reports.filter((r) => r.status === "resolved").length;
    const parts: string[] = [];
    if (openCount > 0) parts.push(`{${C.red}-fg}${openCount} open{/}`);
    if (pendingCount > 0) parts.push(`{${C.yellow}-fg}${pendingCount} pending{/}`);
    if (resolvedCount > 0) parts.push(`{${C.green}-fg}${resolvedCount} resolved{/}`);
    const line2 = ` ${parts.join(" / ")}`;

    statusBar.setContent(`${line1}\n${line2}`);
  }

  function render() {
    applyFilters();
    renderHeader();
    renderList();
    renderDetail();
    renderStatusBar();
    screen.render();
  }

  // --- Key bindings (all on screen, no widget focus issues) ---

  screen.key(["j", "down"], () => {
    if (selectedIdx < filtered.length - 1) selectedIdx++;
    renderList();
    renderDetail();
    screen.render();
  });

  screen.key(["k", "up"], () => {
    if (selectedIdx > 0) selectedIdx--;
    renderList();
    renderDetail();
    screen.render();
  });

  // Mouse click on list panel
  listPanel.on("click", (data: { y: number }) => {
    const clickedLine = data.y - (listPanel.atop as number) - 1; // subtract border
    const idx = clickedLine - 1; // subtract content padding
    if (idx >= 0 && idx < filtered.length) {
      selectedIdx = idx;
      renderList();
      renderDetail();
      screen.render();
    }
  });

  // Search
  screen.key("/", () => {
    const searchBox = blessed.textbox({
      parent: screen,
      bottom: 3,
      left: "center",
      width: "80%",
      height: 3,
      border: { type: "line" },
      style: {
        border: { fg: C.accent },
        bg: C.inputBg,
        fg: C.fg,
      },
      inputOnFocus: true,
      label: " Search ",
      tags: true,
    });
    searchBox.focus();
    searchBox.readInput((_err, value) => {
      searchQuery = value || "";
      searchBox.destroy();
      render();
    });
    screen.render();
  });

  // Escape to clear search
  screen.key("escape", () => {
    if (searchQuery) {
      searchQuery = "";
      render();
    }
  });

  // Tab cycles through filter tabs
  screen.key("tab", () => {
    const idx = TABS.indexOf(activeTab);
    applyTab(TABS[(idx + 1) % TABS.length]);
    render();
  });

  // Shift-Tab cycles backwards
  screen.key("S-tab", () => {
    const idx = TABS.indexOf(activeTab);
    applyTab(TABS[(idx - 1 + TABS.length) % TABS.length]);
    render();
  });

  // Click on header to select tab
  header.on("click", (data: { x: number }) => {
    // Map click x position to tab — find which tab region was clicked
    // This is approximate since blessed tags make exact measurement hard
    const headerText = header.getContent();
    const strippedParts: { tab: FilterTab; start: number; end: number }[] = [];
    let pos = 13; // skip "POSTMORTEM  "
    for (const tab of TABS) {
      const label = tab.toUpperCase();
      const len = label.length + 8; // account for brackets, count, spaces
      strippedParts.push({ tab, start: pos, end: pos + len });
      pos += len + 1;
    }
    for (const part of strippedParts) {
      if (data.x >= part.start && data.x < part.end) {
        applyTab(part.tab);
        render();
        return;
      }
    }
  });

  // Clear filters
  screen.key("c", () => {
    applyTab("all");
    searchQuery = "";
    render();
  });

  // Edit in $EDITOR
  screen.key("e", () => {
    if (filtered.length === 0) return;
    const r = filtered[selectedIdx];
    const editor = process.env.EDITOR || "vi";
    screen.exec(editor, [r.path], {}, () => {
      reports = listReports();
      render();
    });
  });

  // Delete
  screen.key("d", () => {
    if (filtered.length === 0) return;
    const r = filtered[selectedIdx];
    const confirmBox = blessed.question({
      parent: screen,
      top: "center",
      left: "center",
      width: 50,
      height: 5,
      border: { type: "line" },
      style: { border: { fg: C.red }, bg: C.inputBg, fg: C.fg },
      tags: true,
    });
    confirmBox.ask(`Delete ${r.filename}?`, (_err, ok) => {
      if (ok) {
        unlinkSync(r.path);
        reports = listReports();
      }
      confirmBox.destroy();
      render();
    });
  });

  // --- New incident wizard ---

  function promptInput(label: string): Promise<string | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const box = blessed.textbox({
        parent: screen,
        bottom: 3,
        left: "center",
        width: "80%",
        height: 3,
        border: { type: "line" },
        style: {
          border: { fg: C.accent },
          bg: C.inputBg,
          fg: C.fg,
        },
        inputOnFocus: true,
        label: ` ${label} `,
        tags: true,
      });

      box.on("submit", (value: string) => {
        if (resolved) return;
        resolved = true;
        box.destroy();
        screen.render();
        resolve(value ?? "");
      });

      box.on("cancel", () => {
        if (resolved) return;
        resolved = true;
        box.destroy();
        screen.render();
        resolve(null);
      });

      box.focus();
      box.readInput(() => {});
      screen.render();
    });
  }

  function promptSeverity(): Promise<Severity | null> {
    return new Promise((resolve) => {
      const severities: Severity[] = ["critical", "major", "minor"];
      let idx = 1; // default to major

      const box = blessed.box({
        parent: screen,
        bottom: 3,
        left: "center",
        width: "80%",
        height: 3,
        border: { type: "line" },
        style: {
          border: { fg: C.accent },
          bg: C.inputBg,
          fg: C.fg,
        },
        label: " Severity ",
        tags: true,
        keys: true,
        keyable: true,
      });

      function renderSelector() {
        const options = severities.map((s, i) => {
          const color = severityColors[s];
          if (i === idx) return `{${color}-fg}{bold}[ ${s.toUpperCase()} ]{/bold}{/}`;
          return `{${C.dimFg}-fg}  ${s}  {/}`;
        }).join("   ");
        box.setContent(` ${options}    {${C.dimFg}-fg}(left/right to pick, enter to confirm){/}`);
        screen.render();
      }

      renderSelector();
      box.focus();

      box.key(["left", "h"], () => {
        idx = (idx - 1 + severities.length) % severities.length;
        renderSelector();
      });

      box.key(["right", "l"], () => {
        idx = (idx + 1) % severities.length;
        renderSelector();
      });

      box.key("return", () => {
        box.destroy();
        screen.render();
        resolve(severities[idx]);
      });

      box.key("escape", () => {
        box.destroy();
        screen.render();
        resolve(null);
      });
    });
  }

  let isCreating = false;

  screen.key("n", async () => {
    if (isCreating) return;
    isCreating = true;

    try {
      const slug = await promptInput("Short name (e.g. api-outage)");
      if (slug === null || !slug.trim()) { isCreating = false; return; }

      const severity = await promptSeverity();
      if (severity === null) { isCreating = false; return; }

      const summary = await promptInput("What broke?");
      if (summary === null) { isCreating = false; return; }

      const impact = await promptInput("What was the impact?");
      if (impact === null) { isCreating = false; return; }

      const rootCause = await promptInput("What was the root cause?");
      if (rootCause === null) { isCreating = false; return; }

      const detectionFailure = await promptInput("Why was it not detected?");
      if (detectionFailure === null) { isCreating = false; return; }

      const prevention = await promptInput("What will prevent it?");
      if (prevention === null) { isCreating = false; return; }

      const tagsRaw = await promptInput("Tags (comma-separated, or leave empty)");
      if (tagsRaw === null) { isCreating = false; return; }

      const started = await promptInput("When did it start? (e.g. 2026-03-22T14:00, or leave empty)");
      if (started === null) { isCreating = false; return; }

      const detected = await promptInput("When was it detected? (or leave empty)");
      if (detected === null) { isCreating = false; return; }

      const resolved = await promptInput("When was it resolved? (or leave empty)");
      if (resolved === null) { isCreating = false; return; }

      const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

      const data: IncidentData = {
        summary: summary || "",
        impact: impact || "",
        rootCause: rootCause || "",
        detectionFailure: detectionFailure || "",
        prevention: prevention || "",
        severity,
        status: "open",
        tags,
        timeline: { started: started || "", detected: detected || "", resolved: resolved || "" },
        actionItems: [],
      };

      const report = generateReport(data);
      const outPath = getOutputPath(slug.trim());
      const dir = dirname(outPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(outPath, report, "utf-8");

      // Refresh and select the new report
      reports = listReports();
      const newIdx = reports.findIndex((r) => r.path === outPath);
      if (newIdx >= 0) selectedIdx = newIdx;
      applyTab("all");
      searchQuery = "";
      render();
    } finally {
      isCreating = false;
    }
  });

  // --- Quick actions on selected incident ---

  function promptSelect<T extends string>(label: string, options: { value: T; color: string }[], defaultIdx: number): Promise<T | null> {
    return new Promise((resolve) => {
      let idx = defaultIdx;

      const box = blessed.box({
        parent: screen,
        bottom: 3,
        left: "center",
        width: "80%",
        height: 3,
        border: { type: "line" },
        style: {
          border: { fg: C.accent },
          bg: C.inputBg,
          fg: C.fg,
        },
        label: ` ${label} `,
        tags: true,
        keys: true,
        keyable: true,
      });

      function renderOpts() {
        const rendered = options.map((o, i) => {
          if (i === idx) return `{${o.color}-fg}{bold}[ ${o.value.toUpperCase()} ]{/bold}{/}`;
          return `{${C.dimFg}-fg}  ${o.value}  {/}`;
        }).join("   ");
        box.setContent(` ${rendered}    {${C.dimFg}-fg}(left/right, enter to confirm){/}`);
        screen.render();
      }

      renderOpts();
      box.focus();

      box.key(["left", "h"], () => { idx = (idx - 1 + options.length) % options.length; renderOpts(); });
      box.key(["right", "l"], () => { idx = (idx + 1) % options.length; renderOpts(); });
      box.key("return", () => { box.destroy(); screen.render(); resolve(options[idx].value); });
      box.key("escape", () => { box.destroy(); screen.render(); resolve(null); });
    });
  }

  // r — resolve / change status
  screen.key("r", async () => {
    if (filtered.length === 0) return;
    const r = filtered[selectedIdx];

    const statusOpts: { value: "open" | "action-items-pending" | "resolved"; color: string }[] = [
      { value: "open", color: C.red },
      { value: "action-items-pending", color: C.yellow },
      { value: "resolved", color: C.green },
    ];
    const currentIdx = statusOpts.findIndex((o) => o.value === r.status);

    const newStatus = await promptSelect("Status", statusOpts, Math.max(0, currentIdx));
    if (newStatus === null) return;

    updateFrontmatter(r, { status: newStatus });
    reports = listReports();
    render();
  });

  // t — edit timeline fields
  screen.key("t", async () => {
    if (filtered.length === 0) return;
    const r = filtered[selectedIdx];

    const started = await promptInput("Started (e.g. 2026-03-22T14:00)");
    if (started === null) return;

    const detected = await promptInput("Detected");
    if (detected === null) return;

    const resolved = await promptInput("Resolved");
    if (resolved === null) return;

    const fields: Record<string, string> = {};
    if (started) fields.started = started;
    if (detected) fields.detected = detected;
    if (resolved) fields.resolved = resolved;

    if (Object.keys(fields).length > 0) {
      updateFrontmatter(r, fields);
      reports = listReports();
      render();
    }
  });

  // x — change severity
  screen.key("x", async () => {
    if (filtered.length === 0) return;
    const r = filtered[selectedIdx];

    const sevOpts: { value: Severity; color: string }[] = [
      { value: "critical", color: C.red },
      { value: "major", color: C.yellow },
      { value: "minor", color: C.green },
    ];
    const currentIdx = sevOpts.findIndex((o) => o.value === r.severity);

    const newSev = await promptSelect("Severity", sevOpts, Math.max(0, currentIdx));
    if (newSev === null) return;

    updateFrontmatter(r, { severity: newSev });
    reports = listReports();
    render();
  });

  // g — edit tags
  screen.key("g", async () => {
    if (filtered.length === 0) return;
    const r = filtered[selectedIdx];

    const currentTags = r.tags.join(", ");
    const tagsRaw = await promptInput("Tags (comma-separated)");
    if (tagsRaw === null) return;

    updateFrontmatter(r, { tags: tagsRaw || "none" });
    reports = listReports();
    render();
  });

  // Quit
  screen.key(["q", "C-c"], () => process.exit(0));

  // Initial render
  render();
}
