from __future__ import annotations

import argparse
import csv
import json
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set, Tuple

from keywords import CATEGORY_KEYWORDS

SLICE_RE = re.compile(r"mpd\.slice\.(\d+)-(\d+)\.json")
TOKEN_RE = re.compile(r"[a-z0-9']+")
FLOW_FEATURE_KEYS = ["energy", "valence", "tempo"]
FLOW_BINS = 20


@dataclass
class PlaylistSample:
    playlist_name: str
    track_count: int
    tracks_with_features: int
    example_songs: List[Dict[str, object]]
    flow: List[Dict[str, float | int | None]]


def normalize_text(text: str) -> str:
    return " ".join(TOKEN_RE.findall(text.lower())).strip()


def extract_track_id(track_uri: str) -> str:
    if not track_uri:
        return ""
    parts = track_uri.split(":")
    return parts[-1] if parts else ""


def sorted_slice_paths(mpd_dir: Path) -> List[Path]:
    paths: List[Tuple[int, Path]] = []
    for path in mpd_dir.glob("mpd.slice.*.json"):
        match = SLICE_RE.match(path.name)
        if not match:
            continue
        start = int(match.group(1))
        paths.append((start, path))
    return [path for _, path in sorted(paths, key=lambda x: x[0])]


def match_categories(normalized_title: str) -> Set[str]:
    categories: Set[str] = set()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in normalized_title for keyword in keywords):
            categories.add(category)
    return categories


def load_track_features(track_features_csv: Path) -> Dict[str, Dict[str, float]]:
    features: Dict[str, Dict[str, float]] = {}
    with track_features_csv.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            track_id = row.get("track_id", "").strip()
            if not track_id or track_id in features:
                continue
            try:
                features[track_id] = {
                    "energy": float(row["energy"]),
                    "valence": float(row["valence"]),
                    "tempo": float(row["tempo"]),
                }
            except (ValueError, TypeError, KeyError):
                continue
    return features


def build_playlist_flow(tracks: List[dict], track_features: Dict[str, Dict[str, float]]) -> Tuple[List[Dict[str, float | int | None]], int]:
    flow_sums = [{key: 0.0 for key in FLOW_FEATURE_KEYS} for _ in range(FLOW_BINS)]
    flow_counts = [0 for _ in range(FLOW_BINS)]
    tracks_with_features = 0
    track_count = len(tracks)

    for track in tracks:
        track_id = extract_track_id(track.get("track_uri", ""))
        feature_row = track_features.get(track_id)
        if feature_row is None:
            continue

        pos = int(track.get("pos", 0) or 0)
        rel_pos = 0.0 if track_count <= 1 else min(max(pos / (track_count - 1), 0.0), 1.0)
        bin_id = min(FLOW_BINS - 1, int(rel_pos * FLOW_BINS))

        flow_counts[bin_id] += 1
        tracks_with_features += 1
        for key in FLOW_FEATURE_KEYS:
            flow_sums[bin_id][key] += feature_row[key]

    flow_rows: List[Dict[str, float | int | None]] = []
    for i in range(FLOW_BINS):
        row: Dict[str, float | int | None] = {"bin": i}
        if flow_counts[i] > 0:
            for key in FLOW_FEATURE_KEYS:
                row[key] = flow_sums[i][key] / flow_counts[i]
        else:
            for key in FLOW_FEATURE_KEYS:
                row[key] = None
        flow_rows.append(row)

    return flow_rows, tracks_with_features


def sample_example_songs(tracks: List[dict], limit: int = 5) -> List[Dict[str, object]]:
    if not tracks:
        return []

    chosen_indices = sorted({round(i * (len(tracks) - 1) / max(1, limit - 1)) for i in range(limit)})
    songs: List[Dict[str, object]] = []
    for idx in chosen_indices:
        track = tracks[idx]
        songs.append(
            {
                "name": (track.get("track_name") or "Unknown Track").strip() or "Unknown Track",
                "artist": (track.get("artist_name") or "Unknown Artist").strip() or "Unknown Artist",
                "pos": int(track.get("pos", idx) or idx),
            }
        )
    return songs


def reservoir_insert(items: List[PlaylistSample], new_item: PlaylistSample, seen_count: int, rng: random.Random, capacity: int) -> None:
    if len(items) < capacity:
        items.append(new_item)
        return

    replace_idx = rng.randint(0, seen_count - 1)
    if replace_idx < capacity:
        items[replace_idx] = new_item


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build compact sampled playlist flow trajectories for web visualization")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
        help="Path to project data directory",
    )
    parser.add_argument(
        "--output-path",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "flow_samples.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--per-mood",
        type=int,
        default=10,
        help="Number of sampled playlists to retain per mood",
    )
    parser.add_argument(
        "--min-featured-tracks",
        type=int,
        default=8,
        help="Minimum tracks with feature rows required for a playlist sample",
    )
    parser.add_argument(
        "--max-slices",
        type=int,
        default=None,
        help="Optional cap on slices to process for faster iteration",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reservoir sampling reproducibility",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)

    mpd_dir = args.data_dir / "spotify_million_playlist_dataset" / "data"
    track_features_csv = args.data_dir / "track_features.csv"

    print("Loading track features...")
    track_features = load_track_features(track_features_csv)
    print(f"Loaded feature rows: {len(track_features):,}")

    slice_paths = sorted_slice_paths(mpd_dir)
    if args.max_slices is not None:
        slice_paths = slice_paths[: args.max_slices]

    collected: Dict[str, List[PlaylistSample]] = {mood: [] for mood in CATEGORY_KEYWORDS}
    seen_per_mood: Dict[str, int] = {mood: 0 for mood in CATEGORY_KEYWORDS}

    for i, slice_path in enumerate(slice_paths):
        with slice_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        for playlist in payload.get("playlists", []):
            title = (playlist.get("name") or "").strip() or "Untitled playlist"
            normalized = normalize_text(title)
            if not normalized:
                continue

            matched = match_categories(normalized)
            if not matched:
                continue

            tracks = playlist.get("tracks", [])
            flow, tracks_with_features = build_playlist_flow(tracks, track_features)
            if tracks_with_features < args.min_featured_tracks:
                continue

            sample = PlaylistSample(
                playlist_name=title,
                track_count=len(tracks),
                tracks_with_features=tracks_with_features,
                example_songs=sample_example_songs(tracks, limit=5),
                flow=flow,
            )

            for mood in matched:
                seen_per_mood[mood] += 1
                reservoir_insert(
                    items=collected[mood],
                    new_item=sample,
                    seen_count=seen_per_mood[mood],
                    rng=rng,
                    capacity=args.per_mood,
                )

        if (i + 1) % 50 == 0:
            print(f"Processed {i + 1}/{len(slice_paths)} slices")

    result: Dict[str, List[Dict[str, object]]] = {}
    for mood, samples in collected.items():
        result[mood] = [
            {
                "playlistName": s.playlist_name,
                "trackCount": s.track_count,
                "tracksWithFeatures": s.tracks_with_features,
                "exampleSongs": s.example_songs,
                "flow": s.flow,
            }
            for s in samples
        ]

    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"Wrote sampled flow trajectories: {args.output_path}")
    print("Counts per mood:")
    for mood in sorted(result):
        print(f"  {mood}: {len(result[mood])} samples (seen {seen_per_mood[mood]:,} eligible playlists)")


if __name__ == "__main__":
    main()
