import blessed from "blessed";
import { listReports, StoredReport } from "./store.js";

const severityColor: Record<string, string> = {
  critical: "red",
  major: "yellow",
  minor: "green",
};

const statusIcon: Record<string, string> = {
  open: "{red-fg}●{/red-fg}",
  "action-items-pending": "{yellow-fg}●{/yellow-fg}",
  resolved: "{green-fg}●{/green-fg}",
};

export function launchTUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "postmortem",
    fullUnicode: true,
  });

  let reports = listReports();
  let filtered = [...reports];
  let selectedIdx = 0;
  let searchQuery = "";
  let filterSeverity = "";
  let filterStatus = "";

  // Header
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: "blue", fg: "white" },
  });

  // Left panel: incident list
  const list = blessed.list({
    parent: screen,
    top: 1,
    left: 0,
    width: "40%",
    bottom: 1,
    tags: true,
    border: { type: "line" },
    style: {
      border: { fg: "gray" },
      selected: { bg: "blue", fg: "white" },
      item: { fg: "white" },
    },
    scrollable: true,
    mouse: true,
    keys: false,
    vi: false,
  });

  // Right panel: report preview
  const preview = blessed.box({
    parent: screen,
    top: 1,
    left: "40%",
    width: "60%",
    bottom: 1,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "gray" }, fg: "white" },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: false,
    vi: false,
  });

  // Status bar
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: "black", fg: "gray" },
  });

  function applyFilters() {
    filtered = reports.filter((r) => {
      if (filterSeverity && r.severity !== filterSeverity) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.content.toLowerCase().includes(q) ||
          r.filename.toLowerCase().includes(q)
        );
      }
      return true;
    });
    if (selectedIdx >= filtered.length) selectedIdx = Math.max(0, filtered.length - 1);
  }

  function renderList() {
    const items = filtered.map((r, i) => {
      const icon = statusIcon[r.status] || "○";
      const sevColor = severityColor[r.severity] || "white";
      const tags = r.tags.length > 0 ? ` {gray-fg}[${r.tags.join(", ")}]{/gray-fg}` : "";
      return `${icon} {${sevColor}-fg}${r.severity.padEnd(9)}{/${sevColor}-fg} ${r.date} ${r.filename.replace(/\.md$/, "").slice(11)}${tags}`;
    });
    list.setItems(items);
    list.select(selectedIdx);
  }

  function renderPreview() {
    if (filtered.length === 0) {
      preview.setContent("No reports.");
      return;
    }
    const r = filtered[selectedIdx];
    // Strip frontmatter for display
    const body = r.content.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    preview.setContent(body);
    preview.scrollTo(0);
  }

  function renderHeader() {
    const total = reports.length;
    const shown = filtered.length;
    let filterInfo = "";
    if (filterSeverity) filterInfo += ` severity:${filterSeverity}`;
    if (filterStatus) filterInfo += ` status:${filterStatus}`;
    if (searchQuery) filterInfo += ` search:"${searchQuery}"`;
    header.setContent(` {bold}postmortem{/bold} — ${shown}/${total} incidents${filterInfo}`);
  }

  function renderStatusBar() {
    statusBar.setContent(
      " {gray-fg}j/k{/gray-fg} navigate  {gray-fg}/{/gray-fg} search  {gray-fg}s{/gray-fg} severity  {gray-fg}S{/gray-fg} status  {gray-fg}e{/gray-fg} edit  {gray-fg}d{/gray-fg} delete  {gray-fg}c{/gray-fg} clear  {gray-fg}q{/gray-fg} quit"
    );
  }

  function render() {
    applyFilters();
    renderHeader();
    renderList();
    renderPreview();
    renderStatusBar();
    screen.render();
  }

  // Navigation
  screen.key(["j", "down"], () => {
    if (selectedIdx < filtered.length - 1) selectedIdx++;
    renderList();
    renderPreview();
    screen.render();
  });

  screen.key(["k", "up"], () => {
    if (selectedIdx > 0) selectedIdx--;
    renderList();
    renderPreview();
    screen.render();
  });

  list.on("select item", (_item: blessed.Widgets.BlessedElement, index: number) => {
    selectedIdx = index;
    renderPreview();
    screen.render();
  });

  // Search
  screen.key("/", () => {
    const searchBox = blessed.textbox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      style: { bg: "black", fg: "white" },
      inputOnFocus: true,
    });
    searchBox.focus();
    searchBox.readInput((_err, value) => {
      searchQuery = value || "";
      searchBox.destroy();
      render();
    });
    screen.render();
  });

  // Cycle severity filter
  screen.key("s", () => {
    const levels = ["", "critical", "major", "minor"];
    const idx = levels.indexOf(filterSeverity);
    filterSeverity = levels[(idx + 1) % levels.length];
    render();
  });

  // Cycle status filter
  screen.key("S", () => {
    const statuses = ["", "open", "action-items-pending", "resolved"];
    const idx = statuses.indexOf(filterStatus);
    filterStatus = statuses[(idx + 1) % statuses.length];
    render();
  });

  // Clear filters
  screen.key("c", () => {
    filterSeverity = "";
    filterStatus = "";
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
    const confirm = blessed.question({
      parent: screen,
      top: "center",
      left: "center",
      width: 50,
      height: 5,
      border: { type: "line" },
      style: { border: { fg: "red" }, fg: "white" },
    });
    confirm.ask(`Delete ${r.filename}?`, (err, ok) => {
      if (ok) {
        const { unlinkSync } = require("node:fs");
        unlinkSync(r.path);
        reports = listReports();
      }
      confirm.destroy();
      render();
    });
  });

  // Quit
  screen.key(["q", "C-c"], () => process.exit(0));

  // Initial render
  render();
}
