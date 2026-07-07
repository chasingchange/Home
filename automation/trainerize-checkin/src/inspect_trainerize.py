"""One-off helper to calibrate SELECTORS in trainerize_client.py.

Logs in, searches for the given client, and saves a screenshot + full page
HTML for both the search results and the client profile page into ./debug/
so you can inspect real selectors and update trainerize_client.SELECTORS.

Usage: python -m src.inspect_trainerize "Client Name"
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from .config import Config
from .trainerize_client import LOGIN_URL, SELECTORS

DEBUG_DIR = Path(__file__).parent.parent / "debug"


def dump(page, name: str):
    DEBUG_DIR.mkdir(exist_ok=True)
    page.screenshot(path=str(DEBUG_DIR / f"{name}.png"), full_page=True)
    (DEBUG_DIR / f"{name}.html").write_text(page.content())
    print(f"Saved {name}.png and {name}.html to {DEBUG_DIR}/")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m src.inspect_trainerize \"Client Name\"")
        sys.exit(1)
    client_name = sys.argv[1]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(LOGIN_URL)
        dump(page, "01_login_page")
        page.fill(SELECTORS["login_email"], Config.TRAINERIZE_EMAIL)
        page.fill(SELECTORS["login_password"], Config.TRAINERIZE_PASSWORD)
        page.click(SELECTORS["login_submit"])
        page.wait_for_load_state("networkidle")
        dump(page, "02_after_login")

        page.fill(SELECTORS["client_search_box"], client_name)
        page.wait_for_timeout(800)
        dump(page, "03_search_results")

        results = page.query_selector_all(SELECTORS["client_search_result"])
        if results:
            href = results[0].get_attribute("href")
            page.goto(href)
            page.wait_for_load_state("networkidle")
            dump(page, "04_client_profile")
        else:
            print("No search results found with current SELECTORS — inspect 03_search_results.html")

        browser.close()


if __name__ == "__main__":
    main()
