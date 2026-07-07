"""Extract client names from Google Calendar for a given check-in day.

Client sessions on this calendar are titled like "Morgan x Tyler",
"Scott Grooms and Tyler Wade", or "Troy x Tyler" — a client name followed by
a separator ("x", "and", "&") and the coach's name. Non-client blocks (Gym,
Writing, BREAK, Client Review, financial/discovery calls, etc.) never end in
the coach's name and are ignored.
"""
import datetime
import json
import re
from dataclasses import dataclass

from google.oauth2 import service_account
from googleapiclient.discovery import build

from .config import Config

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# Non-client titles that would otherwise slip through if they happen to
# mention the coach's name (belt-and-suspenders on top of the suffix rule).
EXCLUDE_KEYWORDS = {
    "buffer",
    "financial planning",
    "discovery call",
    "weekly review",
}


@dataclass
class ClientSession:
    client_name: str
    event_title: str
    start: datetime.datetime


def _build_service():
    info = json.loads(Config.GOOGLE_SERVICE_ACCOUNT_JSON)
    credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("calendar", "v3", credentials=credentials)


def _extract_client_name(title: str) -> str | None:
    lowered = title.lower()
    if any(keyword in lowered for keyword in EXCLUDE_KEYWORDS):
        return None

    coach_first = re.escape(Config.COACH_FIRST_NAME)
    coach_last = re.escape(Config.COACH_LAST_NAME)
    coach_full = rf"{coach_first}\s+{coach_last}"

    pattern = re.compile(
        rf"^(?P<name>.+?)\s+(?:x|and|&)\s+(?:{coach_full}|{coach_first})\s*$",
        re.IGNORECASE,
    )
    match = pattern.match(title.strip())
    if not match:
        return None
    return match.group("name").strip()


def get_client_sessions(target_date: datetime.date) -> list[ClientSession]:
    """Return one ClientSession per client-named event on target_date."""
    service = _build_service()

    start_of_day = datetime.datetime.combine(target_date, datetime.time.min)
    end_of_day = datetime.datetime.combine(target_date, datetime.time.max)

    events_result = (
        service.events()
        .list(
            calendarId=Config.GOOGLE_CALENDAR_ID,
            timeMin=start_of_day.isoformat() + "Z",
            timeMax=end_of_day.isoformat() + "Z",
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    sessions = []
    for event in events_result.get("items", []):
        title = event.get("summary", "")
        client_name = _extract_client_name(title)
        if not client_name:
            continue
        start_raw = event["start"].get("dateTime", event["start"].get("date"))
        start = datetime.datetime.fromisoformat(start_raw)
        sessions.append(ClientSession(client_name=client_name, event_title=title, start=start))

    # De-duplicate same client appearing twice in one day (e.g. rescheduled).
    seen = set()
    unique_sessions = []
    for session in sessions:
        key = session.client_name.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_sessions.append(session)

    return unique_sessions
