#!/usr/bin/env python3
"""Запрашивает живое радио YouTube Music и показывает рекомендации для оценки."""

import argparse
import re
import sys
from functools import partial
from time import perf_counter


VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
DEFAULT_SEEDS = {
    "7374CZQoS2Y": "Radiohead — No Surprises",
    "4D7u5KF7SP8": "Daft Punk — Get Lucky",
    "Ei8UnOPJX7w": "Adele — Hello",
}


def parse_video_id(value):
    if not VIDEO_ID.fullmatch(value):
        raise argparse.ArgumentTypeError("ожидается videoId из 11 символов")
    return value


def positive_limit(value):
    limit = int(value)
    if not 1 <= limit <= 25:
        raise argparse.ArgumentTypeError("допустимо от 1 до 25 треков")
    return limit


def watch_url(video_id):
    return f"https://music.youtube.com/watch?v={video_id}"


def artist_names(track):
    return [artist["name"] for artist in track.get("artists") or [] if artist.get("name")]


def print_recommendations(tracks, seed_id, limit):
    recommendations = []
    seen_ids = set()
    repeated = invalid = 0
    seed = next((track for track in tracks if track.get("videoId") == seed_id), {})
    if seed.get("title"):
        print(f"Трек в ответе: {', '.join(artist_names(seed)) or '—'} — {seed['title']}")

    for track in tracks:
        video_id = track.get("videoId") or ""
        if video_id == seed_id:
            continue
        if not VIDEO_ID.fullmatch(video_id) or not (track.get("title") or "").strip():
            invalid += 1
            continue
        if video_id in seen_ids:
            repeated += 1
            continue
        seen_ids.add(video_id)
        recommendations.append(track)

    shown = recommendations[:limit]
    distinct_artists = {name.casefold() for track in shown for name in artist_names(track)}
    without_artist = sum(not artist_names(track) for track in shown)
    print(f"В ответе {len(tracks)} позиций и {len(recommendations)} уникальных рекомендаций. "
          f"Дублей по ID: {repeated}, без ID или названия: {invalid}.")
    print(f"В показанной выборке: {len(distinct_artists)} разных артистов, "
          f"{without_artist} треков без имени артиста.")
    for rank, track in enumerate(shown, 1):
        artists = ", ".join(artist_names(track)) or "—"
        album = (track.get("album") or {}).get("name")
        album_label = f" · {album}" if album else ""
        print(f"{rank:2}. {artists} — {track['title']}{album_label}\n"
              f"    {watch_url(track['videoId'])}")
    return shown


def rate_recommendations(tracks):
    print("Оценка: 0 — мимо, 1 — близко, 2 — хорошо подходит, Enter — пропустить.")
    scores = []
    for rank, track in enumerate(tracks, 1):
        while True:
            score = input(f"{rank}. {track['title']}: ").strip()
            if score in {"", "0", "1", "2"}:
                break
        if score:
            scores.append(int(score))
    return scores


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video_ids", nargs="*", type=parse_video_id,
                        help="исходные YouTube videoId; по умолчанию три трека из README")
    parser.add_argument("--limit", type=positive_limit, default=10,
                        help="сколько рекомендаций показать на исходный трек (по умолчанию 10)")
    parser.add_argument("--rate", action="store_true", help="ввести оценку для каждого результата")
    args = parser.parse_args()
    if args.rate and not sys.stdin.isatty():
        parser.error("для --rate нужен интерактивный терминал")

    try:
        from ytmusicapi import YTMusic
        from requests import Session
    except ModuleNotFoundError as exc:
        parser.exit(2, f"Не найден модуль {exc.name}. Установите: python -m pip install ytmusicapi\n")

    seed_ids = list(dict.fromkeys(args.video_ids)) or list(DEFAULT_SEEDS)
    passed = 0
    scores = []
    with Session() as session:
        session.request = partial(session.request, timeout=10)
        radio = YTMusic(requests_session=session)
        for seed_id in seed_ids:
            print(f"\n{DEFAULT_SEEDS.get(seed_id, seed_id)} · {watch_url(seed_id)}", flush=True)
            started = perf_counter()
            try:
                tracks = radio.get_watch_playlist(videoId=seed_id, radio=True, limit=args.limit + 1)["tracks"]
                elapsed = perf_counter() - started
                shown = print_recommendations(tracks, seed_id, args.limit)
            except Exception as exc:
                message = str(exc).split("\n", 1)[0]
                print(f"FAIL ({perf_counter() - started:.2f} с): {type(exc).__name__}: {message}")
                continue
            if not shown:
                print(f"FAIL ({elapsed:.2f} с): нет пригодных рекомендаций")
                continue
            passed += 1
            print(f"OK ({elapsed:.2f} с): получены рекомендации")
            if args.rate:
                seed_scores = rate_recommendations(shown)
                if seed_scores:
                    print(f"Релевантность: {sum(seed_scores) / len(seed_scores):.2f}/2 "
                          f"по {len(seed_scores)} оценкам")
                    scores.extend(seed_scores)

    print(f"\nЖивой ответ с рекомендациями: {passed}/{len(seed_ids)} исходных треков.")
    if scores:
        print(f"Средняя ручная оценка: {sum(scores) / len(scores):.2f}/2 по {len(scores)} оценкам.")
    return 0 if passed == len(seed_ids) else 1


if __name__ == "__main__":
    sys.exit(main())
