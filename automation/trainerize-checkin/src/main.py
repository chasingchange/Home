"""Entrypoint: pull today's Tue/Wed/Thu check-in clients from Google Calendar,
scrape each one's Trainerize snapshot, and write it into the Notion Check In
database. Meant to run unattended (see .github/workflows in the repo root).

Usage:
    python -m src.main                 # run for today
    python -m src.main --date 2026-07-09  # run for a specific date (testing)
"""
from __future__ import annotations

import argparse
import datetime
import sys
import zoneinfo

from .calendar_source import get_client_sessions
from .config import Config
from .notion_sync import create_check_in_row
from .trainerize_client import TrainerizeClient

CHECK_IN_WEEKDAYS = {1, 2, 3}  # Tuesday, Wednesday, Thursday (Monday=0)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None, help="YYYY-MM-DD, defaults to today")
    parser.add_argument(
        "--force", action="store_true", help="Run even if the target date isn't Tue/Wed/Thu"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    tz = zoneinfo.ZoneInfo(Config.TIMEZONE)
    target_date = (
        datetime.date.fromisoformat(args.date)
        if args.date
        else datetime.datetime.now(tz).date()
    )

    if target_date.weekday() not in CHECK_IN_WEEKDAYS and not args.force:
        print(f"{target_date} is not a Tue/Wed/Thu check-in day, skipping. Use --force to override.")
        return

    sessions = get_client_sessions(target_date)
    if not sessions:
        print(f"No client sessions found on the calendar for {target_date}.")
        return

    print(f"Found {len(sessions)} client session(s) for {target_date}:")
    for session in sessions:
        print(f"  - {session.client_name} ({session.event_title} @ {session.start.time()})")

    failures = []
    with TrainerizeClient() as trainerize:
        for session in sessions:
            print(f"\nPulling Trainerize data for {session.client_name}...")
            try:
                snapshot = trainerize.get_client_snapshot(session.client_name)
                if snapshot is None:
                    print(f"  ! Could not find {session.client_name} in Trainerize, skipping.")
                    failures.append(session.client_name)
                    continue
                page_id = create_check_in_row(snapshot, target_date)
                print(f"  Synced to Notion Check In: {page_id}")
            except Exception as exc:  # noqa: BLE001 — surface but keep processing other clients
                print(f"  ! Failed for {session.client_name}: {exc}")
                failures.append(session.client_name)

    if failures:
        print(f"\nCompleted with {len(failures)} failure(s): {', '.join(failures)}")
        sys.exit(1)

    print("\nAll client snapshots synced.")


if __name__ == "__main__":
    main()
