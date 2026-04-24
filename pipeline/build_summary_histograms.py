from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

import re

SLICE_RE = re.compile(r"mpd\.slice\.(\d+)-(\d+)\.json")


def sorted_slice_paths(mpd_dir: Path) -> List[Path]:
    paths: List[Tuple[int, Path]] = []
    for path in mpd_dir.glob("mpd.slice.*.json"):
        match = SLICE_RE.match(path.name)
        if not match:
            continue
        start = int(match.group(1))
        paths.append((start, path))
    return [path for _, path in sorted(paths, key=lambda x: x[0])]


def build_histogram_buckets(
    values: list[int], max_buckets: int = 15
) -> list[Dict[str, int | str]]:
    """Group values into buckets and return histogram data."""
    if not values:
        return []

    min_val = min(values)
    max_val = max(values)
    
    if min_val == max_val:
        return [
            {
                "bucketMin": min_val,
                "bucketMax": max_val,
                "bucketLabel": str(min_val),
                "count": len(values),
            }
        ]

    # Calculate bucket size to have roughly max_buckets buckets
    value_range = max_val - min_val
    bucket_size = max(1, (value_range + max_buckets - 1) // max_buckets)
    
    counter = Counter(values)

    # Determine bucket boundaries
    bucket_start = (min_val // bucket_size) * bucket_size
    bucket_end = ((max_val // bucket_size) + 1) * bucket_size

    buckets = []
    for bucket_min in range(bucket_start, bucket_end, bucket_size):
        bucket_max = bucket_min + bucket_size - 1
        count = 0
        for val in range(bucket_min, bucket_max + 1):
            count += counter.get(val, 0)

        if count > 0:
            buckets.append(
                {
                    "bucketMin": bucket_min,
                    "bucketMax": bucket_max,
                    "bucketLabel": f"{bucket_min}-{bucket_max}",
                    "count": count,
                }
            )

    return buckets


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build playlist distribution histograms for summary visualization"
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
        help="Path to project data directory",
    )
    parser.add_argument(
        "--output-path",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "summary_histograms.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--max-slices",
        type=int,
        default=None,
        help="Optional cap on slices to process for testing",
    )
    parser.add_argument(
        "--max-buckets",
        type=int,
        default=15,
        help="Maximum number of histogram buckets per distribution",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    mpd_dir = args.data_dir / "spotify_million_playlist_dataset" / "data"

    slice_paths = sorted_slice_paths(mpd_dir)
    if args.max_slices is not None:
        slice_paths = slice_paths[: args.max_slices]

    artist_counts: list[int] = []
    track_counts: list[int] = []

    print(f"Processing {len(slice_paths)} slices to build histograms...")

    for i, slice_path in enumerate(slice_paths):
        with slice_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        for playlist in payload.get("playlists", []):
            tracks = playlist.get("tracks", [])
            if not tracks:
                continue

            # Count unique artists in this playlist
            artist_ids = set()
            for track in tracks:
                artist_uri = track.get("artist_uri", "")
                if artist_uri:
                    artist_ids.add(artist_uri)

            artist_counts.append(len(artist_ids))
            track_counts.append(len(tracks))

        if (i + 1) % 100 == 0:
            print(f"Processed {i + 1}/{len(slice_paths)} slices, {len(artist_counts):,} playlists")

    print(f"\nBuilding histograms from {len(artist_counts):,} playlists...")

    artist_histogram = build_histogram_buckets(artist_counts, max_buckets=args.max_buckets)
    track_histogram = build_histogram_buckets(track_counts, max_buckets=args.max_buckets)

    result = {
        "totalPlaylists": len(artist_counts),
        "artistCountHistogram": {
            "label": "Artists per Playlist",
            "buckets": artist_histogram,
            "stats": {
                "min": min(artist_counts) if artist_counts else 0,
                "max": max(artist_counts) if artist_counts else 0,
                "median": sorted(artist_counts)[len(artist_counts) // 2] if artist_counts else 0,
                "mean": sum(artist_counts) / len(artist_counts) if artist_counts else 0,
            },
        },
        "trackCountHistogram": {
            "label": "Songs per Playlist",
            "buckets": track_histogram,
            "stats": {
                "min": min(track_counts) if track_counts else 0,
                "max": max(track_counts) if track_counts else 0,
                "median": sorted(track_counts)[len(track_counts) // 2] if track_counts else 0,
                "mean": sum(track_counts) / len(track_counts) if track_counts else 0,
            },
        },
    }

    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"\nWrote histograms to: {args.output_path}")
    print("\nArtist Count Distribution:")
    print(f"  Range: {result['artistCountHistogram']['stats']['min']}-{result['artistCountHistogram']['stats']['max']}")
    print(f"  Mean: {result['artistCountHistogram']['stats']['mean']:.1f}")
    print(f"  Median: {result['artistCountHistogram']['stats']['median']}")

    print("\nTrack Count Distribution:")
    print(f"  Range: {result['trackCountHistogram']['stats']['min']}-{result['trackCountHistogram']['stats']['max']}")
    print(f"  Mean: {result['trackCountHistogram']['stats']['mean']:.1f}")
    print(f"  Median: {result['trackCountHistogram']['stats']['median']}")


if __name__ == "__main__":
    main()
