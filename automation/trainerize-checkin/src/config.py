import os


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


class Config:
    # Google Calendar
    GOOGLE_SERVICE_ACCOUNT_JSON = _require("GOOGLE_SERVICE_ACCOUNT_JSON")
    GOOGLE_CALENDAR_ID = _require("GOOGLE_CALENDAR_ID")

    # Trainerize (trainer login, not an API key — see README)
    TRAINERIZE_EMAIL = _require("TRAINERIZE_EMAIL")
    TRAINERIZE_PASSWORD = _require("TRAINERIZE_PASSWORD")

    # Notion
    NOTION_TOKEN = _require("NOTION_TOKEN")
    NOTION_CHECK_IN_DATA_SOURCE_ID = _require("NOTION_CHECK_IN_DATA_SOURCE_ID")
    NOTION_CURRENT_CLIENTS_DATA_SOURCE_ID = _require("NOTION_CURRENT_CLIENTS_DATA_SOURCE_ID")

    # Coach identity used to match "X x Tyler" style calendar events.
    COACH_FIRST_NAME = os.environ.get("COACH_FIRST_NAME", "Tyler")
    COACH_LAST_NAME = os.environ.get("COACH_LAST_NAME", "Wade")

    # Timezone used to compute "today" for the calendar window.
    TIMEZONE = os.environ.get("TIMEZONE", "America/Chicago")
