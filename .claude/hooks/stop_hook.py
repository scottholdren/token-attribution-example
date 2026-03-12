#!/usr/bin/env python3
"""
Claude Code Stop hook.
Reads session data from stdin, parses the transcript JSONL,
sums token usage for all assistant responses not yet written to a temp file,
and writes the result to a temp file for the post-commit hook.
"""

import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone


def unlogged_tokens(transcript_path: str, session_id: str) -> dict:
    fields = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
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

    # estimate cost using claude sonnet 4.6 pricing as default
    # input: $3/MTok, output: $15/MTok, cache_read: $0.30/MTok, cache_write: $3.75/MTok
    input_cost    = (token_data["input_tokens"] / 1_000_000) * 3.00
    output_cost   = (token_data["output_tokens"] / 1_000_000) * 15.00
    cache_read    = (token_data["cache_read_input_tokens"] / 1_000_000) * 0.30
    cache_write   = (token_data["cache_creation_input_tokens"] / 1_000_000) * 3.75
    cost_usd      = round(input_cost + output_cost + cache_read + cache_write, 6)

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
        pass  # not in a git repo, or hook missing — skip silently


if __name__ == "__main__":
    main()
