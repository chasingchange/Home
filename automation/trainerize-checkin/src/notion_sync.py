"""Write a Trainerize snapshot into the "Check In" Notion database.

The Check In database's Weight/Nutrition/Squat/Bicep/Bench/Missed fields are
the *coach's* judgment categories, not raw numbers — so this fills them with
a best-effort guess (see trainerize_client.categorize_*) and always writes
the literal scraped text into "Trainerize Raw Pull" so the coach can verify
or correct the guess in seconds rather than trusting it blindly.

Fields intentionally left untouched because they're the coach's own
decisions made during/after the call, not something to auto-fill:
Obstacles, Solutions-content, Homework, Questions, Assignment, Cardio Set,
Calendar, and Lever (Notion's "Lever" is a coaching-intervention category —
e.g. "Low Protein" — unrelated to Trainerize's "Lever" exercise stat, which
is only surfaced via Trainerize Raw Pull to avoid conflating the two).
"""
from __future__ import annotations

import datetime

import requests

from .config import Config
from .trainerize_client import (
    ClientSnapshot,
    categorize_lift,
    categorize_missed,
    categorize_nutrition,
    categorize_weight,
)

NOTION_VERSION = "2025-09-03"
BASE_URL = "https://api.notion.com/v1"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {Config.NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def find_client_page_id(client_name: str) -> str | None:
    """Look up the matching row in Current Clients by (first) name.

    Returns None if there's no match or more than one match — ambiguous
    matches are surfaced in the raw pull text instead of guessed at.
    """
    url = f"{BASE_URL}/data_sources/{Config.NOTION_CURRENT_CLIENTS_DATA_SOURCE_ID}/query"
    payload = {"filter": {"property": "Name", "title": {"contains": client_name}}}
    response = requests.post(url, headers=_headers(), json=payload, timeout=30)
    response.raise_for_status()
    results = response.json().get("results", [])
    if len(results) != 1:
        return None
    return results[0]["id"]


def _multi_select(values: list[str]) -> list[dict]:
    return [{"name": v} for v in values]


def build_raw_pull_text(snapshot: ClientSnapshot) -> str:
    return (
        f"Missed: {snapshot.missed_raw}\n"
        f"Weight: {snapshot.weight_raw}\n"
        f"Nutrition: {snapshot.nutrition_raw}\n"
        f"Squat: {snapshot.squat_raw}\n"
        f"Bicep: {snapshot.bicep_raw}\n"
        f"Bench: {snapshot.bench_raw}\n"
        f"Lever (Trainerize exercise stat, not a coaching lever): {snapshot.lever_raw}"
    )


def create_check_in_row(snapshot: ClientSnapshot, check_in_date: datetime.date) -> str:
    client_page_id = find_client_page_id(snapshot.client_name)
    raw_pull_text = build_raw_pull_text(snapshot)
    if client_page_id is None:
        raw_pull_text += (
            "\n\n⚠ Could not confidently match this client in Current Clients "
            "(zero or multiple name matches) — link it manually."
        )

    properties = {
        "Solutions": {
            "title": [
                {
                    "text": {
                        "content": f"{snapshot.client_name} — Trainerize pull {check_in_date.isoformat()}"
                    }
                }
            ]
        },
        "Date": {"date": {"start": check_in_date.isoformat()}},
        "Missed": {"multi_select": _multi_select(categorize_missed(snapshot.missed_raw))},
        "Weight": {"select": {"name": categorize_weight(snapshot.weight_raw)}},
        "Nutrition": {"multi_select": _multi_select(categorize_nutrition(snapshot.nutrition_raw))},
        "Squat": {"select": {"name": categorize_lift(snapshot.squat_raw)}},
        "Bicep": {"select": {"name": categorize_lift(snapshot.bicep_raw)}},
        "Bench": {"select": {"name": categorize_lift(snapshot.bench_raw)}},
        "Trainerize Raw Pull": {"rich_text": [{"text": {"content": raw_pull_text}}]},
        "Trainerize Profile": {"url": snapshot.profile_url},
    }
    if client_page_id:
        properties["📊 Client Canon"] = {"relation": [{"id": client_page_id}]}

    payload = {
        "parent": {"type": "data_source_id", "data_source_id": Config.NOTION_CHECK_IN_DATA_SOURCE_ID},
        "properties": properties,
    }
    response = requests.post(f"{BASE_URL}/pages", headers=_headers(), json=payload, timeout=30)
    response.raise_for_status()
    return response.json()["id"]
