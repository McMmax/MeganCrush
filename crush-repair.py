#!/usr/bin/env python3
"""
crush-repair.py — Fix corrupted Crush sessions that fail to resume.

When Crush freezes mid-tool-call (e.g. IDE closes), the session history
ends with an assistant `tool_call` that has no matching `tool_result`.
The Claude API rejects this on resume with:

    messages.N: `tool_use` ids were found without `tool_result` blocks

This script scans all crush.db databases and injects synthetic
tool_result messages for any orphaned tool_calls so sessions can
resume cleanly.  It runs in a loop until all orphans are resolved.

Usage:
    python3 crush-repair.py              # auto-find and repair all crush.db files
    python3 crush-repair.py /path/to/crush.db   # repair a specific database
    python3 crush-repair.py --dry-run    # show what would be fixed without changing anything
"""

import sqlite3
import json
import sys
import uuid
from pathlib import Path


def find_crush_dbs():
    home = Path.home()
    candidates = [
        home / ".crush" / "crush.db",
        home / ".local" / "share" / "crush" / "crush.db",
    ]
    projects_json = home / ".local" / "share" / "crush" / "projects.json"
    if projects_json.exists():
        try:
            with open(projects_json) as f:
                data = json.load(f)
            for proj in data.get("projects", []):
                dd = proj.get("data_dir", "")
                if dd:
                    candidates.append(Path(dd) / "crush.db")
        except (json.JSONDecodeError, KeyError):
            pass
    seen = set()
    result = []
    for p in candidates:
        rp = p.resolve()
        if rp.exists() and rp not in seen:
            seen.add(rp)
            result.append(str(rp))
    return result


def find_orphans(cursor, sid):
    """Return list of (tool_id, tool_name, insert_after_ts) for orphaned tool_calls."""
    cursor.execute(
        "SELECT id, role, parts, created_at FROM messages "
        "WHERE session_id=? ORDER BY created_at ASC",
        (sid,),
    )
    messages = cursor.fetchall()
    if not messages:
        return []

    all_result_ids = set()
    for _, role, parts_raw, _ in messages:
        if role == "tool":
            for p in json.loads(parts_raw):
                if isinstance(p, dict) and p.get("type") == "tool_result":
                    d = p.get("data", p)
                    all_result_ids.add(d.get("tool_call_id", ""))

    orphans = []
    for i, (mid, role, parts_raw, created_at) in enumerate(messages):
        if role != "assistant":
            continue
        for p in json.loads(parts_raw):
            if isinstance(p, dict) and p.get("type") in ("tool_use", "tool_call"):
                d = p.get("data", p)
                tid = d.get("id", "")
                tname = d.get("name", "unknown")
                if tid and tid not in all_result_ids:
                    next_ts = created_at
                    for j in range(i + 1, len(messages)):
                        _, jr, _, jts = messages[j]
                        if jr in ("assistant", "user"):
                            break
                        next_ts = jts
                    orphans.append((tid, tname, next_ts))

    return orphans


def repair_db(db_path, dry_run=False):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM sessions ORDER BY updated_at DESC")
    sessions = cursor.fetchall()

    total = 0
    for sid, title in sessions:
        pass_num = 0
        while True:
            orphans = find_orphans(cursor, sid)
            if not orphans:
                break
            pass_num += 1
            if pass_num == 1:
                print(f"  Session: {title or sid}")
            print(f"    Pass {pass_num}: {len(orphans)} orphaned tool call(s)")
            for tid, tname, _ in orphans:
                print(f"      - {tname} ({tid[:24]}...)")

            if dry_run:
                print(f"    [DRY RUN] Would inject {len(orphans)} tool_result(s)")
                total += len(orphans)
                break

            for tid, tname, after_ts in orphans:
                parts = [
                    {
                        "type": "tool_result",
                        "data": {
                            "tool_call_id": tid,
                            "name": tname,
                            "content": "[Session interrupted — tool call did not complete]",
                            "data": "",
                            "mime_type": "",
                            "metadata": json.dumps({
                                "output": "[Session interrupted]",
                                "description": "Auto-repaired by crush-repair",
                            }),
                            "is_error": True,
                        },
                    },
                    {"type": "finish", "data": {"reason": "stop", "time": 0}},
                ]
                msg_id = str(uuid.uuid4())
                ts = after_ts + 1
                cursor.execute(
                    "INSERT INTO messages (id, session_id, role, parts, created_at, updated_at, finished_at) "
                    "VALUES (?, ?, 'tool', ?, ?, ?, ?)",
                    (msg_id, sid, json.dumps(parts), ts, ts, ts),
                )
                total += 1
            conn.commit()

            if pass_num > 10:
                print("    WARNING: too many passes, stopping")
                break

        if pass_num > 0 and not dry_run:
            print(f"    FIXED\n")

    conn.close()
    return total


def main():
    dry_run = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    db_paths = args if args else find_crush_dbs()

    if not db_paths:
        print("No crush.db files found.")
        sys.exit(1)

    total = 0
    for db_path in db_paths:
        print(f"Scanning {db_path} ...")
        total += repair_db(db_path, dry_run=dry_run)

    if total == 0:
        print("No corrupted sessions found.")
    else:
        action = "would inject" if dry_run else "injected"
        print(f"Done — {action} {total} tool_result repair(s).")


if __name__ == "__main__":
    main()
