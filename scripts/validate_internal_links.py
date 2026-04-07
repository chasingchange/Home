#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK_EXTENSIONS = {".html", ".js", ".json", ".css"}

ATTR_PATTERN = re.compile(r"(?:href|src)\s*=\s*['\"]([^'\"]+)['\"]", re.IGNORECASE)
JS_NAV_PATTERN = re.compile(
    r"(?:window\.location(?:\.href)?|location\.href|location\.assign|location\.replace|router\.push|navigate)\s*\(?\s*['\"]([^'\"]+)['\"]",
    re.IGNORECASE,
)


def repo_files() -> set[str]:
    return {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_file()}


def repo_dirs() -> set[str]:
    return {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*") if p.is_dir()}


def is_external(target: str) -> bool:
    prefixes = ("http://", "https://", "mailto:", "tel:", "javascript:", "data:", "#", "//")
    return target.startswith(prefixes)


def normalize_target(target: str) -> str:
    return target.split("#", 1)[0].split("?", 1)[0].strip()


def resolve_path(source_file: Path, target: str) -> str | None:
    target_clean = normalize_target(target)
    if not target_clean:
        return None

    if target_clean.startswith("/"):
        return f"ROOT_RELATIVE::{target_clean}"

    resolved = (source_file.parent / target_clean).resolve()
    try:
        return resolved.relative_to(ROOT).as_posix()
    except ValueError:
        return f"OUTSIDE_REPO::{target_clean}"


def main() -> int:
    files = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in CHECK_EXTENSIONS]
    all_files = repo_files()
    all_dirs = repo_dirs()
    lower_files = {path.lower(): path for path in all_files}

    problems: list[tuple[str, str, str]] = []

    for file in files:
        text = file.read_text(encoding="utf-8", errors="ignore")
        targets = [*ATTR_PATTERN.findall(text), *JS_NAV_PATTERN.findall(text)]

        for target in targets:
            if not target or "${" in target or is_external(target):
                continue

            resolved = resolve_path(file, target)
            if not resolved:
                continue

            if resolved.startswith("ROOT_RELATIVE::"):
                problems.append((file.relative_to(ROOT).as_posix(), target, "Root-relative path (breaks on GitHub Pages project sites)"))
                continue

            if resolved.startswith("OUTSIDE_REPO::"):
                problems.append((file.relative_to(ROOT).as_posix(), target, "Path resolves outside repository"))
                continue

            if resolved in all_files:
                continue

            if resolved in all_dirs and (ROOT / resolved / "index.html").exists():
                continue

            if resolved.lower() in lower_files:
                problems.append((file.relative_to(ROOT).as_posix(), target, f"Case mismatch; expected {lower_files[resolved.lower()]}"))
            else:
                problems.append((file.relative_to(ROOT).as_posix(), target, "Missing target"))

    if problems:
        print("Broken internal link targets found:\n")
        for source, target, reason in problems:
            print(f"- {source}: {target} -> {reason}")
        return 1

    print("No broken internal links found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
