import { CodeBlock } from '../components/CodeBlock'

type Page = 'home' | 'sample' | 'upload'

interface HomePageProps {
  setPage: (p: Page) => void
}

const SETTINGS_JSON = `{
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
}`

const STOP_HOOK_PY = `#!/usr/bin/env python3
"""
Claude Code Stop hook.
Reads session data from stdin, parses the transcript JSONL,
sums token usage for all assistant responses not yet written to a temp file,
writes the result to a temp file, then amends the most recent commit
so the commit that triggered this session captures its own cost.
"""

import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone


def unlogged_tokens(transcript_path: str, session_id: str) -> dict:
    fields = ["input_tokens", "output_tokens",
              "cache_creation_input_tokens", "cache_read_input_tokens"]
    totals = {f: 0 for f in fields}
    last_obj = None

    try:
        with open(transcript_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if obj.get("type") == "assistant" and obj.get("message", {}).get("usage"):
                    response_id = obj.get("uuid")
                    if response_id:
                        stem = Path(f"/tmp/claude-audit-{session_id}-{response_id}")
                        if stem.with_suffix(".json").exists() or stem.with_suffix(".done").exists():
                            continue

                    usage = obj["message"]["usage"]
                    for f in fields:
                        totals[f] += usage.get(f) or 0
                    last_obj = obj
    except FileNotFoundError:
        pass

    if not last_obj:
        return totals | {"model": None, "git_branch": None, "response_id": None}

    msg = last_obj.get("message", {})
    return totals | {
        "model": msg.get("model"),
        "git_branch": last_obj.get("gitBranch"),
        "response_id": last_obj.get("uuid"),
    }


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)

    try:
        hook_input = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(0)

    session_id = hook_input.get("session_id", "unknown")
    transcript_path = hook_input.get("transcript_path", "")

    if not transcript_path or not Path(transcript_path).exists():
        sys.exit(0)

    token_data = unlogged_tokens(transcript_path, session_id)

    # Estimate cost using Claude Sonnet 4.6 pricing
    # input: $3/MTok, output: $15/MTok,
    # cache_read: $0.30/MTok, cache_write: $3.75/MTok
    input_cost  = (token_data["input_tokens"] / 1_000_000) * 3.00
    output_cost = (token_data["output_tokens"] / 1_000_000) * 15.00
    cache_read  = (token_data["cache_read_input_tokens"] / 1_000_000) * 0.30
    cache_write = (token_data["cache_creation_input_tokens"] / 1_000_000) * 3.75
    cost_usd    = round(input_cost + output_cost + cache_read + cache_write, 6)

    response_id = token_data["response_id"] or session_id

    payload = {
        "session_id": session_id,
        "response_id": response_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "transcript_path": transcript_path,
        "model": token_data["model"],
        "git_branch": token_data["git_branch"],
        "tokens": {
            "input": token_data["input_tokens"],
            "output": token_data["output_tokens"],
            "cache_creation": token_data["cache_creation_input_tokens"],
            "cache_read": token_data["cache_read_input_tokens"],
        },
        "cost_usd": cost_usd,
    }

    tmp_path = Path(f"/tmp/claude-audit-{session_id}-{response_id}.json")
    tmp_path.write_text(json.dumps(payload, indent=2))

    # Amend the most recent commit to include these tokens.
    # This ensures the commit that triggered this session captures its own
    # cost, even when Claude ran the commit mid-response.
    try:
        repo_root = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        post_commit = Path(repo_root) / ".git" / "hooks" / "post-commit"
        if post_commit.exists():
            subprocess.run(["python3", str(post_commit)], cwd=repo_root, check=False)
    except (subprocess.CalledProcessError, OSError):
        pass  # not in a git repo, or hook missing - skip silently


if __name__ == "__main__":
    main()`

const POST_COMMIT = `#!/usr/bin/env python3
"""
Git post-commit hook.
Finds Claude Code session temp files written in the last 30 minutes,
merges them with the current commit data, appends to .claude-audit/log.json,
stages the log file, and amends the commit to include it.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

AUDIT_LOG = Path(".claude-audit/log.json")
TMP_DIR = Path("/tmp")
SESSION_GLOB = "claude-audit-*.json"
SESSION_MAX_AGE_MINUTES = 30


def run(cmd: list[str], check=True) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, check=check)
    return result.stdout.strip()


def get_commit_data() -> dict:
    commit_hash = run(["git", "rev-parse", "HEAD"])
    commit_msg  = run(["git", "log", "-1", "--pretty=%s"])
    files_changed = run(["git", "diff-tree", "--no-commit-id", "-r", "--name-only", "HEAD"])
    author    = run(["git", "log", "-1", "--pretty=%an"])
    timestamp = run(["git", "log", "-1", "--pretty=%aI"])
    return {
        "commit": commit_hash,
        "timestamp": timestamp,
        "message": commit_msg,
        "author": author,
        "files_changed": [f for f in files_changed.splitlines() if f],
    }


def find_recent_sessions() -> list[Path]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=SESSION_MAX_AGE_MINUTES)
    sessions = []
    for tmp_file in TMP_DIR.glob(SESSION_GLOB):
        mtime = datetime.fromtimestamp(tmp_file.stat().st_mtime, tz=timezone.utc)
        if mtime >= cutoff:
            sessions.append(tmp_file)
    return sessions


def consume_session(tmp_file: Path) -> dict | None:
    try:
        data = json.loads(tmp_file.read_text())
        tmp_file.rename(tmp_file.with_suffix(".done"))
        return data
    except (json.JSONDecodeError, OSError):
        return None


def load_log() -> list:
    if not AUDIT_LOG.exists():
        return []
    try:
        return json.loads(AUDIT_LOG.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def save_log(entries: list):
    AUDIT_LOG.parent.mkdir(exist_ok=True)
    AUDIT_LOG.write_text(json.dumps(entries, indent=2))


def main():
    sessions = find_recent_sessions()
    if not sessions:
        sys.exit(0)

    commit_data = get_commit_data()

    # avoid infinite loop on audit-log amend
    if commit_data["files_changed"] == [str(AUDIT_LOG)]:
        sys.exit(0)

    entries = load_log()
    for tmp_file in sessions:
        session = consume_session(tmp_file)
        if not session:
            continue
        entry = {
            **commit_data,
            "claude": {
                "session_id": session["session_id"],
                "model": session["model"],
                "git_branch": session["git_branch"],
                "tokens": session["tokens"],
                "cost_usd": session["cost_usd"],
                "session_timestamp": session["timestamp"],
            },
        }
        entries.append(entry)

    save_log(entries)
    run(["git", "add", str(AUDIT_LOG)])
    run(["git", "commit", "--amend", "--no-edit", "--no-verify"])


if __name__ == "__main__":
    main()`

export function HomePage({ setPage }: HomePageProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-slate-900">Token Attribution for Claude Code</h1>
        <p className="mt-4 text-lg text-slate-600">
          Automatically track which commits consumed Claude tokens and how much they cost - without
          changing your workflow. Every{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-mono text-slate-800">
            git commit
          </code>{' '}
          gets annotated with token and cost data from your Claude Code session.
        </p>
      </div>

      {/* How it works */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold text-slate-800">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Stop hook fires',
              desc: 'When Claude Code finishes a response, the Stop hook sums token usage for all responses not yet written to a temp file and writes a JSON payload to /tmp.',
            },
            {
              step: '2',
              title: 'Most recent commit amended',
              desc: 'The Stop hook immediately calls the post-commit script, which appends the token data to .claude-audit/log.json and amends the most recent commit to include it.',
            },
            {
              step: '3',
              title: 'post-commit as a fallback',
              desc: 'The post-commit hook also runs on every git commit, picking up any temp files that exist at that moment - ensuring nothing is missed if commits are run manually.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                {step}
              </div>
              <h3 className="mb-1 font-semibold text-slate-800">{title}</h3>
              <p className="text-sm text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Install guide */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold text-slate-800">Installation</h2>

        <div className="space-y-8">
          <div>
            <h3 className="mb-2 font-semibold text-slate-700">
              Step 1 - Create the Stop hook script
            </h3>
            <p className="mb-2 text-sm text-slate-500">
              Save this to{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">
                .claude/hooks/stop_hook.py
              </code>{' '}
              in your repository.
            </p>
            <CodeBlock language="python">{STOP_HOOK_PY}</CodeBlock>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-700">
              Step 2 - Configure Claude Code settings
            </h3>
            <p className="mb-2 text-sm text-slate-500">
              Add to your{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">
                .claude/settings.json
              </code>{' '}
              (update the path to match your repo).
            </p>
            <CodeBlock language="json">{SETTINGS_JSON}</CodeBlock>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-700">
              Step 3 - Install the post-commit hook
            </h3>
            <p className="mb-2 text-sm text-slate-500">
              Save this to{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">
                .git/hooks/post-commit
              </code>{' '}
              and make it executable:{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">
                chmod +x .git/hooks/post-commit
              </code>
            </p>
            <CodeBlock language="python">{POST_COMMIT}</CodeBlock>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-700">Step 4 - Verify</h3>
            <p className="text-sm text-slate-500">
              Use Claude Code to make a change, then commit. Check that{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">
                .claude-audit/log.json
              </code>{' '}
              was created and the commit was amended to include it.
            </p>
          </div>
        </div>
      </section>

      {/* Data format */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold text-slate-800">Log entry format</h2>
        <p className="mb-3 text-slate-600">
          Each entry in{' '}
          <code className="rounded bg-slate-100 px-1 font-mono">log.json</code> looks like:
        </p>
        <CodeBlock language="json">{`{
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
}`}</CodeBlock>
      </section>

      {/* CTA */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold text-slate-800">Explore the data</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setPage('sample')}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            View sample data →
          </button>
          <button
            onClick={() => setPage('upload')}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Upload your log.json →
          </button>
        </div>
      </section>
    </div>
  )
}
