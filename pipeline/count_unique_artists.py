from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import List, Set, Tuple

SLICE_RE = re.compile(r"mpd\.slice\.(\d+)-(\d+)\.json")


def extract_artist_id(artist_uri: str) -> str:
    if not artist_uri:
        return ""
    parts = artist_uri.split(":")
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


def count_unique_artists(data_dir: Path, max_slices: int | None = None) -> int:
    mpd_dir = data_dir / "spotify_million_playlist_dataset" / "data"
    slice_paths = sorted_slice_paths(mpd_dir)
    if max_slices is not None:
        slice_paths = slice_paths[:max_slices]

    artists_seen: Set[str] = set()

    for idx, slice_path in enumerate(slice_paths, start=1):
        with slice_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        for playlist in payload.get("playlists", []):
            for track in playlist.get("tracks", []):
                artist_id = extract_artist_id(track.get("artist_uri", ""))
                if artist_id:
                    artists_seen.add(artist_id)
                else:
                    artist_name = (track.get("artist_name") or "").strip()
                    if artist_name:
                        artists_seen.add(artist_name.lower())

        if idx % 50 == 0:
            print(f"Processed {idx}/{len(slice_paths)} slices")

    return len(artists_seen)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Count unique artists across the Spotify MPD slices")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
        help="Path to the project's data directory",
    )
    parser.add_argument(
        "--max-slices",
        type=int,
        default=None,
        help="Optional cap for number of MPD slice files to process for faster iteration",
    )
    parser.add_argument(
        "--output-file",
        type=Path,
        default=None,
        help="Optional JSON file to write the artist count summary to",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    total_artists_seen = count_unique_artists(data_dir=args.data_dir, max_slices=args.max_slices)
    result = {"totalArtistsSeen": total_artists_seen}

    print(json.dumps(result, indent=2))

    if args.output_file is not None:
        args.output_file.parent.mkdir(parents=True, exist_ok=True)
        args.output_file.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"Wrote: {args.output_file}")


if __name__ == "__main__":
    main()
