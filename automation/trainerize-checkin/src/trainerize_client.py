"""Playwright automation for pulling a client snapshot from Trainerize.

Trainerize has no self-serve API for individual trainers, so this drives the
trainer web dashboard (trainerize.me) directly with a real login. This is
inherently more fragile than an API: if Trainerize changes its UI, the
SELECTORS below will need updating.

IMPORTANT — this file has NOT been calibrated against the live Trainerize
UI (no login credentials were available while writing it). Before trusting
this in production, run `python -m src.inspect_trainerize "<client name>"`
locally with your real credentials, look at the saved screenshot/HTML dump
in ./debug/, and adjust SELECTORS + the scrape_* functions to match what you
actually see. Everything selector-related is isolated in this one file.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from playwright.sync_api import sync_playwright, Page

from .config import Config

LOGIN_URL = "https://www.trainerize.me/login/"

# Centralized so a UI change only requires editing this dict.
SELECTORS = {
    "login_email": "input[name='email']",
    "login_password": "input[name='password']",
    "login_submit": "button[type='submit']",
    "client_search_box": "input[placeholder='Search']",
    "client_search_result": "a.client-list-item",
    "stat_missed": "[data-stat='missed']",
    "stat_weight": "[data-stat='weight']",
    "stat_nutrition": "[data-stat='nutrition']",
    "stat_squat": "[data-stat='squat']",
    "stat_bicep": "[data-stat='bicep']",
    "stat_bench": "[data-stat='bench']",
    "stat_lever": "[data-stat='lever']",
}


@dataclass
class ClientSnapshot:
    client_name: str
    profile_url: str
    missed_raw: str
    weight_raw: str
    nutrition_raw: str
    squat_raw: str
    bicep_raw: str
    bench_raw: str
    lever_raw: str


class TrainerizeClient:
    def __enter__(self):
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        self._page: Page = self._browser.new_page()
        self._login()
        return self

    def __exit__(self, exc_type, exc, tb):
        self._browser.close()
        self._playwright.stop()

    def _login(self):
        page = self._page
        page.goto(LOGIN_URL)
        page.fill(SELECTORS["login_email"], Config.TRAINERIZE_EMAIL)
        page.fill(SELECTORS["login_password"], Config.TRAINERIZE_PASSWORD)
        page.click(SELECTORS["login_submit"])
        page.wait_for_load_state("networkidle")

    def find_client_profile_url(self, client_name: str) -> str | None:
        page = self._page
        page.fill(SELECTORS["client_search_box"], client_name)
        page.wait_for_timeout(500)
        results = page.query_selector_all(SELECTORS["client_search_result"])
        if not results:
            return None
        # Prefer an exact first-name match if multiple clients share a search hit.
        for result in results:
            text = (result.inner_text() or "").strip()
            if text.lower().startswith(client_name.lower()):
                return result.get_attribute("href")
        return results[0].get_attribute("href")

    def get_client_snapshot(self, client_name: str) -> ClientSnapshot | None:
        profile_url = self.find_client_profile_url(client_name)
        if not profile_url:
            return None

        page = self._page
        page.goto(profile_url)
        page.wait_for_load_state("networkidle")

        def text_of(selector: str) -> str:
            el = page.query_selector(selector)
            return (el.inner_text().strip() if el else "") or "Not found"

        return ClientSnapshot(
            client_name=client_name,
            profile_url=profile_url,
            missed_raw=text_of(SELECTORS["stat_missed"]),
            weight_raw=text_of(SELECTORS["stat_weight"]),
            nutrition_raw=text_of(SELECTORS["stat_nutrition"]),
            squat_raw=text_of(SELECTORS["stat_squat"]),
            bicep_raw=text_of(SELECTORS["stat_bicep"]),
            bench_raw=text_of(SELECTORS["stat_bench"]),
            lever_raw=text_of(SELECTORS["stat_lever"]),
        )


_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def categorize_weight(weight_raw: str) -> str:
    """Best-effort heuristic — coach should verify. Looks for a trend arrow
    or +/- delta in the scraped text and maps it to a Check In select option."""
    lowered = weight_raw.lower()
    if "not found" in lowered or "no log" in lowered or "no data" in lowered:
        return "Not Tracking"
    numbers = _NUMBER_RE.findall(weight_raw)
    if len(numbers) < 2:
        return "NA"
    delta = float(numbers[-1])
    if abs(delta) < 0.3:
        return "Stalled"
    return "On Track" if delta != 0 else "Regressed"


def categorize_lift(lift_raw: str) -> str:
    lowered = lift_raw.lower()
    if "not found" in lowered:
        return "No Change"
    if "weight" in lowered or "lb" in lowered or "kg" in lowered:
        return "Strength"
    if "rep" in lowered or "set" in lowered or "volume" in lowered:
        return "Volume"
    return "No Change"


def categorize_nutrition(nutrition_raw: str) -> list[str]:
    lowered = nutrition_raw.lower()
    if "not found" in lowered or "no log" in lowered:
        return ["No Tracking"]
    if "under" in lowered:
        return ["Under"]
    if "over" in lowered:
        return ["Over"]
    if "range" in lowered or "on track" in lowered:
        return ["In Range"]
    return ["NA"]


def categorize_missed(missed_raw: str) -> list[str]:
    lowered = missed_raw.lower()
    tags = []
    for day_type in ("push", "pull", "leg"):
        if day_type in lowered:
            tags.append(day_type.capitalize())
    if not tags:
        tags.append("None" if "0" in lowered else "NA")
    return tags
