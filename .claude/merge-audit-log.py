#!/usr/bin/env python3
"""
Git merge driver for .claude-audit/log.json.

Merges two audit log arrays by combining unique entries from both sides,
deduplicating by commit hash and sorting by timestamp.

Git calls this as: merge-audit-log.py %O %A %B
  %O = base (common ancestor)
  %A = ours  (result is written back here)
  %B = theirs
"""

import json
import sys
from pathlib import Path


def load(path: str) -> list:
    try:
        data = json.loads(Path(path).read_text())
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def main():
    if len(sys.argv) != 4:
        print("Usage: merge-audit-log.py <base> <ours> <theirs>", file=sys.stderr)
        sys.exit(1)

    _, ours_path, theirs_path = sys.argv[1], sys.argv[2], sys.argv[3]

    ours = load(ours_path)
    theirs = load(theirs_path)

    seen = {e["commit"] for e in ours if "commit" in e}
    for entry in theirs:
        h = entry.get("commit")
        if h and h not in seen:
            ours.append(entry)
            seen.add(h)

    ours.sort(key=lambda e: e.get("timestamp", ""))

    Path(ours_path).write_text(json.dumps(ours, indent=2))


if __name__ == "__main__":
    main()
