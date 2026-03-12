# Token Attribution for Claude Code

Automatically annotate every `git commit` with the Claude token usage and estimated cost from your Claude Code session - without changing your workflow.

**[View the docs & live demo →](https://scottholdren.github.io/token-attribution-example/)**

## How it works

```
Claude Code session ends
        │
        ▼
  Stop hook fires
  (.claude/hooks/stop_hook.py)
  Reads transcript JSONL, extracts last response tokens + cost
  Writes /tmp/claude-audit-<session>-<response>.json
        │
        ▼
  git commit
        │
        ▼
  post-commit hook fires
  (.git/hooks/post-commit)
  Finds recent temp files, merges with commit metadata
  Appends entry to .claude-audit/log.json
  Amends the commit to include the log
```

Each commit in your repo ends up carrying its own token attribution. Over time, `log.json` becomes a full history of Claude usage across your project.

## Log entry format

```json
{
  "commit": "a1b2c3d...",
  "timestamp": "2026-03-05T15:05:33+00:00",
  "message": "feat: mobile-responsive cart drawer",
  "author": "Bob Martinez",
  "files_changed": ["src/components/CartDrawer.tsx"],
  "claude": {
    "session_id": "sess-abc",
    "response_id": "resp-xyz",
    "model": "claude-sonnet-4-6",
    "git_branch": "main",
    "tokens": {
      "input": 58900,
      "output": 16700,
      "cache_creation": 27000,
      "cache_read": 24000
    },
    "cost_usd": 0.5687,
    "session_timestamp": "2026-03-05T15:01:48+00:00"
  }
}
```

## Installation

### 1. Create the Stop hook

Save [`.claude/hooks/stop_hook.py`](.claude/hooks/stop_hook.py) to your repo.

Then add the hook to your Claude Code settings (`.claude/settings.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/your/repo/.claude/hooks/stop_hook.py"
          }
        ]
      }
    ]
  }
}
```

### 2. Install the post-commit hook

Copy [`.git/hooks/post-commit`](.git/hooks/post-commit) (see the script in this repo's git hooks) and make it executable:

```bash
chmod +x .git/hooks/post-commit
```

### 3. Verify

Use Claude Code to make a change, then commit. You should see `.claude-audit/log.json` created and the commit amended to include it:

```bash
git show --stat HEAD   # should include .claude-audit/log.json
cat .claude-audit/log.json
```

## Multi-developer teams

`log.json` is a JSON array, so concurrent commits from different developers would normally cause merge conflicts. A custom git merge driver handles this automatically - it unions the two arrays by commit hash and sorts by timestamp, so merges always succeed cleanly.

### Setup (each developer runs once)

```bash
git config merge.claude-audit-merge.name "Claude audit log merge driver"
git config merge.claude-audit-merge.driver "python3 .claude/merge-audit-log.py %O %A %B"
```

The `.gitattributes` file in this repo tells git to use this driver for `log.json` - but the driver itself must be registered locally since git doesn't auto-trust merge drivers from repos. Each developer needs to run those two `git config` lines after cloning.

## Visualizing your data

The [docs site](https://scottholdren.github.io/token-attribution-example/) has two visualization modes:

- **Sample data** - pre-loaded with 15 realistic commits so you can explore the charts immediately
- **Upload your own** - drag and drop your `.claude-audit/log.json` to visualize your project's token spend

### Run the docs site locally

```bash
cd docs-site
npm install
npm run dev
```

## Cost estimation

The Stop hook estimates cost using Claude Sonnet 4.6 pricing as a baseline:

| Token type | Rate |
|---|---|
| Input | $3.00 / MTok |
| Output | $15.00 / MTok |
| Cache read | $0.30 / MTok |
| Cache write | $3.75 / MTok |

Adjust the rates in `stop_hook.py` if you're using a different model.

## Files

```
.claude/
  hooks/
    stop_hook.py          # Claude Code Stop hook
  merge-audit-log.py      # Git merge driver (multi-developer support)
  settings.json           # Hook registration
.gitattributes            # Points log.json at the merge driver
.claude-audit/
  log.json                # Accumulated audit log (git-tracked)
docs-site/                # Vite + React visualization site
```
