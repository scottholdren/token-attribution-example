#!/usr/bin/env python3
"""
Claude Code Stop hook.
At the end of each response, sums all transcript responses not yet counted,
then updates or creates a log entry for the current feature commit and
creates a new audit commit. No temp files — the log is the source of truth.
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
        ["git", "log", "-1", "--format=%aI\t%s\t%an", hash_], repo_root
    ).split("\t", 2)
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

    # Find the repo root
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(0)
    repo_root = result.stdout.strip()

    # Find the feature commit to attribute tokens to
    feature_hash = feature_commit(repo_root)
    if not feature_hash:
        sys.exit(0)

    # Load the audit log
    audit_log = Path(repo_root) / ".claude-audit" / "log.json"
    try:
        entries = json.loads(audit_log.read_text()) if audit_log.exists() else []
    except (json.JSONDecodeError, OSError):
        entries = []

    # Find the last response UUID already logged for this session — the
    # high-water mark. Only count transcript responses that appear after it.
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
    main()
