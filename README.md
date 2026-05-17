# postmortem

Write incident postmortems while the details are still fresh. Terminal UI for browsing, CLI for everything else.

## Install

```bash
git clone git@github.com:zaguezzar/postmortem.git
cd postmortem
npm install && npm run build && npm link
```

## Usage

```bash
postmortem                # open the TUI
postmortem new            # write a new report interactively
postmortem list           # ls reports (filter with --severity, --status, --tag)
postmortem show <name>    # print one to stdout
postmortem edit <name>    # open in $EDITOR
postmortem search <query> # grep across all reports
postmortem stats          # counts by severity and status
```

`postmortem new` also accepts `--summary`, `--impact`, `--root-cause`, `--detection`, `--prevention`, `--severity`, `--status`, `--started`, `--detected`, `--resolved`, `--tags`, `--actions`, `--slug`, `-o`, and `--stdout` for non-interactive use.

Reports are written as Markdown with YAML frontmatter.
