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
At the end of each response, sums all transcript responses not yet counted,
then updates or creates a log entry for the current feature commit and
creates a new audit commit. No temp files - the log is the source of truth.
"""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


COST_PER_M = {
    "input": 3.00,
    "output": 15.00,
    "cache_read": 0.30,
    "cache_creation": 3.75,
}


def compute_cost(tokens: dict) -> float:
    return round(
        (tokens["input"]          / 1_000_000) * COST_PER_M["input"] +
        (tokens["output"]         / 1_000_000) * COST_PER_M["output"] +
        (tokens["cache_read"]     / 1_000_000) * COST_PER_M["cache_read"] +
        (tokens["cache_creation"] / 1_000_000) * COST_PER_M["cache_creation"],
        6,
    )


def read_transcript(path: str) -> list[dict]:
    """Return all assistant messages with usage data, in transcript order."""
    responses = []
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("type") == "assistant" and obj.get("message", {}).get("usage"):
                    responses.append(obj)
    except FileNotFoundError:
        pass
    return responses


def sum_tokens(responses: list[dict]) -> dict:
    totals = {"input": 0, "output": 0, "cache_creation": 0, "cache_read": 0}
    for obj in responses:
        u = obj["message"]["usage"]
        totals["input"]          += u.get("input_tokens") or 0
        totals["output"]         += u.get("output_tokens") or 0
        totals["cache_creation"] += u.get("cache_creation_input_tokens") or 0
        totals["cache_read"]     += u.get("cache_read_input_tokens") or 0
    return totals


def git(cmd: list[str], cwd: str) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd).stdout.strip()


def feature_commit(repo_root: str) -> str | None:
    """Most recent non-audit commit hash."""
    for line in git(["git", "log", "--format=%H %s", "-20"], repo_root).splitlines():
        h, _, subject = line.partition(" ")
        if not subject.startswith("audit:"):
            return h
    return None


def commit_metadata(hash_: str, repo_root: str) -> dict:
    ts, msg, author = git(
        ["git", "log", "-1", "--format=%aI\\t%s\\t%an", hash_], repo_root
    ).split("\\t", 2)
    files = git(
        ["git", "diff-tree", "--no-commit-id", "-r", "--name-only", hash_], repo_root
    ).splitlines()
    return {
        "commit": hash_,
        "timestamp": ts,
        "message": msg,
        "author": author,
        "files_changed": [f for f in files if f],
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

    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(0)
    repo_root = result.stdout.strip()

    feature_hash = feature_commit(repo_root)
    if not feature_hash:
        sys.exit(0)

    audit_log = Path(repo_root) / ".claude-audit" / "log.json"
    try:
        entries = json.loads(audit_log.read_text()) if audit_log.exists() else []
    except (json.JSONDecodeError, OSError):
        entries = []

    # Find the high-water mark: last response UUID already logged for this session
    last_logged_id = None
    for entry in reversed(entries):
        if entry.get("claude", {}).get("session_id") == session_id:
            last_logged_id = entry["claude"].get("last_response_id")
            break

    all_responses = read_transcript(transcript_path)

    if last_logged_id:
        cutoff = next(
            (i for i, r in enumerate(all_responses) if r.get("uuid") == last_logged_id),
            -1,
        )
        new_responses = all_responses[cutoff + 1:]
    else:
        new_responses = all_responses

    if not new_responses:
        sys.exit(0)

    last = new_responses[-1]
    new_tokens = sum_tokens(new_responses)

    # Update existing entry for this commit, or create a new one
    existing = next((e for e in entries if e.get("commit") == feature_hash), None)

    if existing:
        t = existing["claude"]["tokens"]
        t["input"]          += new_tokens["input"]
        t["output"]         += new_tokens["output"]
        t["cache_creation"] += new_tokens["cache_creation"]
        t["cache_read"]     += new_tokens["cache_read"]
        existing["claude"]["cost_usd"] = compute_cost(t)
        existing["claude"]["last_response_id"] = last.get("uuid")
    else:
        meta = commit_metadata(feature_hash, repo_root)
        entries.append({
            **meta,
            "claude": {
                "session_id": session_id,
                "model": last.get("message", {}).get("model"),
                "git_branch": last.get("gitBranch"),
                "tokens": new_tokens,
                "cost_usd": compute_cost(new_tokens),
                "session_timestamp": datetime.now(timezone.utc).isoformat(),
                "last_response_id": last.get("uuid"),
            },
        })

    audit_log.parent.mkdir(exist_ok=True)
    audit_log.write_text(json.dumps(entries, indent=2))
    subprocess.run(["git", "add", str(audit_log)], cwd=repo_root)
    subprocess.run(
        ["git", "commit", "--no-verify", "-m",
         f"audit: update token attribution for {feature_hash[:7]}"],
        cwd=repo_root,
    )


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
              desc: 'When Claude Code finishes a response, the Stop hook reads the transcript JSONL and sums token usage for all responses not yet counted, using a stored high-water mark UUID to find only new responses.',
            },
            {
              step: '2',
              title: 'Log entry updated',
              desc: 'The Stop hook finds the most recent non-audit commit and either creates a new log entry in .claude-audit/log.json or adds the new tokens to an existing one for that commit.',
            },
            {
              step: '3',
              title: 'Audit commit created',
              desc: 'The Stop hook creates a new audit: commit containing the updated log. No temp files, no git amend - commit hashes stay stable and the log is always the source of truth.',
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
            <h3 className="mb-2 font-semibold text-slate-700">Step 3 - Verify</h3>
            <p className="text-sm text-slate-500">
              Use Claude Code to make a change, then commit. After the response finishes, check
              that{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">
                .claude-audit/log.json
              </code>{' '}
              was created and a new{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-700">audit:</code>
              {' '}commit appeared in your git log.
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
    "model": "claude-sonnet-4-6",
    "git_branch": "main",
    "tokens": {
      "input": 58900,
      "output": 16700,
      "cache_creation": 27000,
      "cache_read": 24000
    },
    "cost_usd": 0.5687,
    "session_timestamp": "2026-03-05T15:01:48+00:00",
    "last_response_id": "resp-xyz"
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
