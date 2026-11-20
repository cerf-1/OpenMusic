#!/usr/bin/env python3
"""Find similar tracks through the Music Matcher web UI using Playwright."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import shutil
import sys
import unicodedata

from playwright.async_api import Error as PlaywrightError, Page, async_playwright

BASE_URL = "https://musicmatcher.app/"
RESULTS = "section[data-results-state]"
SUGGESTIONS = "div.cursor-pointer:has(> div > p)"


class MusicMatcherError(RuntimeError):
    """The site could not provide recommendations for the requested track."""


def _normalize(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum())


async def _select_seed(page: Page, artist: str, track: str) -> None:
    field = page.get_by_test_id("seed-search-input")
    await field.fill(f"{artist} {track}")
    # Wait for the debounced search to finish, rather than pressing Enter on a
    # stale dropdown or silently choosing a cover/remix by a different artist.
    await page.wait_for_function(
        """selector => [...document.querySelectorAll(selector)].some(e =>
            e.checkVisibility()) || document.body.innerText.includes('No results found for')""",
        arg=SUGGESTIONS,
    )
    await page.locator('[aria-label="Searching"]').wait_for(state="hidden")
    candidates = page.locator(SUGGESTIONS)
    available: list[tuple[str, str]] = []
    for index in range(await candidates.count()):
        candidate = candidates.nth(index)
        if not await candidate.is_visible():
            continue
        labels = await candidate.locator("p").all_text_contents()
        if len(labels) < 2:
            continue
        found_track = labels[0].strip()
        found_artist = labels[1].split(" · ", 1)[0].strip()
        available.append((found_artist, found_track))
        if (_normalize(found_artist), _normalize(found_track)) == (
            _normalize(artist), _normalize(track)
        ):
            # The site closes the dropdown on any window scroll, including
            # Playwright's automatic scroll-into-view before a pointer click.
            await candidate.dispatch_event("click")
            return
    raise MusicMatcherError(
        f"Точное совпадение ({artist!r}, {track!r}) не найдено. "
        f"Подсказки сайта: {available!r}"
    )


async def _read_results(page: Page) -> list[tuple[str, str]]:
    section = page.locator(RESULTS)
    await section.wait_for(state="visible")
    await page.locator(f'{RESULTS}[aria-busy="false"]').wait_for(state="visible")
    # Scope to recommendation rows. The page also contains a source-track hero
    # and unrelated discovery sections, neither belongs in the returned list.
    rows = section.locator("div.grid:has(.track-row-scroll[title])")
    result: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for row in await rows.all():
        values = await row.locator(".track-row-scroll[title]").evaluate_all(
            "nodes => nodes.map(n => n.getAttribute('title'))"
        )
        if len(values) != 2 or not all(values):
            raise MusicMatcherError("Разметка карточек Music Matcher изменилась.")
        track, artist = (value.strip() for value in values)
        key = (_normalize(artist), _normalize(track))
        if key not in seen:
            seen.add(key)
            result.append((artist, track))
    if not result:
        detail = re.sub(r"\s+", " ", await section.inner_text()).strip()
        raise MusicMatcherError(f"Сайт не вернул похожие треки: {detail or 'пустой результат'}")
    return result


async def find_similar_tracks(
    artist: str,
    track: str,
    *,
    limit: int = 12,
    timeout: float = 90,
    headless: bool = False,
    executable_path: str | None = None,
) -> list[tuple[str, str]]:
    """Return (artist, track) tuples, in the site's order; raise on failure.

    timeout is the total time budget in seconds, including browser startup.
    No login, private API calls, or persistent browser profile are used.
    """
    artist, track = artist.strip(), track.strip()
    if not artist or not track:
        raise ValueError("Artist и Track не должны быть пустыми")
    if limit <= 0 or timeout <= 0:
        raise ValueError("limit и timeout должны быть положительными")
    # Also support the project-local browser downloaded during setup.
    bundled = Path(__file__).resolve().parent / ".browsers"
    if bundled.is_dir() and "PLAYWRIGHT_BROWSERS_PATH" not in os.environ:
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(bundled)
    try:
        async with asyncio.timeout(timeout):
            async with async_playwright() as playwright:
                if executable_path is None and not Path(playwright.chromium.executable_path).is_file():
                    executable_path = shutil.which("google-chrome") or shutil.which("chromium")
                browser = await playwright.chromium.launch(
                    headless=headless, executable_path=executable_path
                )
                try:
                    page = await browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
                    page.set_default_timeout(timeout * 1000)
                    await page.goto(BASE_URL, wait_until="domcontentloaded")
                    await _select_seed(page, artist, track)
                    tracks = await _read_results(page)
                    source = (_normalize(artist), _normalize(track))
                    return [pair for pair in tracks if tuple(map(_normalize, pair)) != source][:limit]
                finally:
                    await browser.close()
    except TimeoutError as exc:
        raise MusicMatcherError(f"Music Matcher не ответил за {timeout:g} секунд") from exc
    except PlaywrightError as exc:
        raise MusicMatcherError(f"Ошибка Playwright: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Похожие треки из musicmatcher.app через Playwright")
    parser.add_argument("artist", help="Исполнитель исходной песни")
    parser.add_argument("track", help="Название исходной песни")
    parser.add_argument("--limit", type=int, default=12, help="Максимальное число результатов (по умолчанию 12)")
    parser.add_argument("--timeout", type=float, default=90, help="Общий таймаут в секундах")
    parser.add_argument("--headed", action="store_true", help="Показать браузер")
    parser.add_argument("--executable-path", help="Путь к установленному Chromium/Chrome")
    args = parser.parse_args()
    try:
        tracks = asyncio.run(find_similar_tracks(
            args.artist, args.track, limit=args.limit, timeout=args.timeout,
            headless=not args.headed, executable_path=args.executable_path,
        ))
    except (MusicMatcherError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    print(json.dumps(tracks, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
