from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set, Tuple

from keywords import CATEGORY_KEYWORDS, STOP_WORDS
from streaming_embeddings import EmbeddingConfig, train_doc2vec_model, write_embedding_artifacts

TOKEN_RE = re.compile(r"[a-z0-9']+")
SLICE_RE = re.compile(r"mpd\.slice\.(\d+)-(\d+)\.json")
FEATURE_KEYS = [
    "danceability",
    "energy",
    "valence",
    "tempo",
    "acousticness",
    "instrumentalness",
]
FLOW_FEATURE_KEYS = ["energy", "valence", "tempo"]
FLOW_BINS = 20


@dataclass
class CategoryAccumulator:
    playlists: int
    top_tracks: Counter
    top_artists: Counter
    track_presence: Counter
    feature_sums: Dict[str, float]
    feature_count: int
    flow_sums: List[Dict[str, float]]
    flow_counts: List[int]
    playlist_examples: List[str]


def normalize_text(text: str) -> str:
    return " ".join(TOKEN_RE.findall(text.lower())).strip()


def tokenize(text: str) -> List[str]:
    return TOKEN_RE.findall(text.lower())


def extract_track_id(track_uri: str) -> str:
    if not track_uri:
        return ""
    parts = track_uri.split(":")
    return parts[-1] if parts else ""


def init_category_accumulator() -> CategoryAccumulator:
    flow_sums = [{key: 0.0 for key in FLOW_FEATURE_KEYS} for _ in range(FLOW_BINS)]
    flow_counts = [0 for _ in range(FLOW_BINS)]
    return CategoryAccumulator(
        playlists=0,
        top_tracks=Counter(),
        top_artists=Counter(),
        track_presence=Counter(),
        feature_sums={key: 0.0 for key in FEATURE_KEYS},
        feature_count=0,
        flow_sums=flow_sums,
        flow_counts=flow_counts,
        playlist_examples=[],
    )


def load_track_features(track_features_csv: Path) -> Dict[str, Dict[str, float]]:
    features: Dict[str, Dict[str, float]] = {}
    with track_features_csv.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            track_id = row.get("track_id", "").strip()
            if not track_id:
                continue
            if track_id in features:
                continue
            try:
                features[track_id] = {
                    "danceability": float(row["danceability"]),
                    "energy": float(row["energy"]),
                    "valence": float(row["valence"]),
                    "tempo": float(row["tempo"]),
                    "acousticness": float(row["acousticness"]),
                    "instrumentalness": float(row["instrumentalness"]),
                }
            except (ValueError, TypeError, KeyError):
                continue
    return features


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


def tokenize_for_embedding(text: str) -> List[str]:
    return [t for t in tokenize(text) if len(t) > 2 and not t.isdigit() and t not in STOP_WORDS]


def build_playlist_document_tokens(name: str, tracks: List[dict], categories: Set[str]) -> List[str]:
    title_tokens = [f"ttl_{t}" for t in tokenize_for_embedding(name)]
    tokens: List[str] = []

    if title_tokens:
        # Repeat title tokens once to keep playlist-level intent salient relative to long track lists.
        tokens.extend(title_tokens)
        tokens.extend(title_tokens)

    for category in sorted(categories):
        tokens.append(f"ctx_{category}")

    for track in tracks[:60]:
        track_name = (track.get("track_name") or "").strip()
        artist_name = (track.get("artist_name") or "").strip()
        for tok in tokenize_for_embedding(track_name)[:3]:
            tokens.append(f"trk_{tok}")
        for tok in tokenize_for_embedding(artist_name)[:2]:
            tokens.append(f"art_{tok}")

    return tokens[:260]


def finalize_category_data(acc: CategoryAccumulator) -> Dict[str, object]:
    avg_features = {}
    if acc.feature_count > 0:
        avg_features = {k: v / acc.feature_count for k, v in acc.feature_sums.items()}

    flow = []
    for i in range(FLOW_BINS):
        row = {"bin": i}
        if acc.flow_counts[i] > 0:
            for key in FLOW_FEATURE_KEYS:
                row[key] = acc.flow_sums[i][key] / acc.flow_counts[i]
        else:
            for key in FLOW_FEATURE_KEYS:
                row[key] = None
        flow.append(row)

    playlist_count = max(acc.playlists, 1)
    shares = [c / playlist_count for c in acc.track_presence.values() if c > 0]
    simpson = float(sum(s * s for s in shares)) if shares else 0.0
    top50_avg = 0.0
    top50 = acc.track_presence.most_common(50)
    if top50:
        top50_avg = float(sum(count / playlist_count for _, count in top50) / len(top50))

    return {
        "playlists": acc.playlists,
        "topTracks": [{"name": name, "count": count} for name, count in acc.top_tracks.most_common(12)],
        "topArtists": [{"name": name, "count": count} for name, count in acc.top_artists.most_common(12)],
        "avgFeatures": avg_features,
        "consensus": {
            "simpson": simpson,
            "top50AvgShare": top50_avg,
            "uniqueTracks": len(acc.track_presence),
        },
        "flow": flow,
        "examples": acc.playlist_examples,
    }


def process_dataset(
    data_dir: Path,
    output_dir: Path,
    max_slices: int | None,
    embedding_dim: int,
    embedding_epochs: int,
    embedding_viz_sample: int,
) -> None:
    mpd_dir = data_dir / "spotify_million_playlist_dataset" / "data"
    track_features_csv = data_dir / "track_features.csv"

    print("Loading track features...")
    track_features = load_track_features(track_features_csv)
    print(f"Loaded track feature rows: {len(track_features):,}")

    slice_paths = sorted_slice_paths(mpd_dir)
    if max_slices is not None:
        slice_paths = slice_paths[:max_slices]

    category_data = {category: init_category_accumulator() for category in CATEGORY_KEYWORDS.keys()}
    output_dir.mkdir(parents=True, exist_ok=True)
    corpus_path = output_dir / "playlist_embedding_corpus.txt"
    meta_path = output_dir / "playlist_embedding_meta.jsonl"

    total_playlists = 0
    total_tracks = 0
    playlist_title_words = Counter()
    title_counter = Counter()
    embedded_docs = 0

    with corpus_path.open("w", encoding="utf-8") as corpus_f, meta_path.open("w", encoding="utf-8") as meta_f:
        for idx, slice_path in enumerate(slice_paths):
            with slice_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)

            for playlist in payload.get("playlists", []):
                total_playlists += 1
                name = (playlist.get("name") or "").strip()
                normalized_name = normalize_text(name)
                tracks = playlist.get("tracks", [])
                track_count = len(tracks)

                if normalized_name:
                    title_counter[normalized_name] += 1
                    for token in tokenize(normalized_name):
                        if token in STOP_WORDS or token.isdigit() or len(token) <= 2:
                            continue
                        playlist_title_words[token] += 1

                matched = match_categories(normalized_name) if normalized_name else set()

                doc_tokens = build_playlist_document_tokens(name=name, tracks=tracks, categories=matched)
                if doc_tokens:
                    corpus_f.write(" ".join(doc_tokens) + "\n")
                    meta_f.write(
                        json.dumps(
                            {
                                "title": name or "Untitled playlist",
                                "trackCount": track_count,
                                "categories": sorted(list(matched)),
                            },
                            ensure_ascii=True,
                        )
                        + "\n"
                    )
                    embedded_docs += 1

                if not matched:
                    continue

                seen_tracks_for_category = {category: set() for category in matched}

                for category in matched:
                    category_data[category].playlists += 1
                    if len(category_data[category].playlist_examples) < 10:
                        category_data[category].playlist_examples.append(name)

                for track in tracks:
                    total_tracks += 1
                    track_name = (track.get("track_name") or "").strip() or "Unknown Track"
                    artist_name = (track.get("artist_name") or "").strip() or "Unknown Artist"
                    track_id = extract_track_id(track.get("track_uri", ""))
                    pos = int(track.get("pos", 0) or 0)
                    feature_row = track_features.get(track_id)

                    for category in matched:
                        cat = category_data[category]
                        cat.top_tracks[track_name] += 1
                        cat.top_artists[artist_name] += 1

                        if track_id and track_id not in seen_tracks_for_category[category]:
                            cat.track_presence[track_id] += 1
                            seen_tracks_for_category[category].add(track_id)

                        if feature_row is None:
                            continue

                        cat.feature_count += 1
                        for key in FEATURE_KEYS:
                            cat.feature_sums[key] += feature_row[key]

                        rel_pos = 0.0 if track_count <= 1 else min(max(pos / (track_count - 1), 0.0), 1.0)
                        bin_id = min(FLOW_BINS - 1, int(rel_pos * FLOW_BINS))
                        cat.flow_counts[bin_id] += 1
                        for key in FLOW_FEATURE_KEYS:
                            cat.flow_sums[bin_id][key] += feature_row[key]

            if (idx + 1) % 50 == 0:
                print(f"Processed {idx + 1}/{len(slice_paths)} slices")

    if embedded_docs == 0:
        raise RuntimeError("No playlist documents were written for embedding training.")

    print(f"Training streaming embeddings from {embedded_docs:,} playlists...")
    embedding_config = EmbeddingConfig(
        vector_size=embedding_dim,
        epochs=embedding_epochs,
        max_viz_points=embedding_viz_sample,
    )
    model = train_doc2vec_model(corpus_path=corpus_path, config=embedding_config)
    model.save(str(output_dir / "playlist_doc2vec.model"))
    print("Building embedding-based clusters and similarity artifacts...")
    embedding_summary = write_embedding_artifacts(
        model=model,
        meta_path=meta_path,
        output_dir=output_dir,
        categories=list(CATEGORY_KEYWORDS.keys()),
        stop_words=list(STOP_WORDS),
        config=embedding_config,
    )

    category_output = {}
    consensus_rows = []
    flow_rows = {}
    for category, acc in category_data.items():
        finalized = finalize_category_data(acc)
        category_output[category] = {
            "playlists": finalized["playlists"],
            "topTracks": finalized["topTracks"],
            "topArtists": finalized["topArtists"],
            "avgFeatures": finalized["avgFeatures"],
            "examples": finalized["examples"],
        }
        flow_rows[category] = finalized["flow"]
        consensus_rows.append(
            {
                "category": category,
                "playlists": finalized["playlists"],
                "simpson": finalized["consensus"]["simpson"],
                "top50AvgShare": finalized["consensus"]["top50AvgShare"],
                "uniqueTracks": finalized["consensus"]["uniqueTracks"],
            }
        )

    consensus_rows.sort(key=lambda row: row["top50AvgShare"], reverse=True)

    summary = {
        "totalPlaylists": total_playlists,
        "totalTracksSeen": total_tracks,
        "categories": {category: category_output[category]["playlists"] for category in category_output},
        "topWords": [{"word": word, "count": count} for word, count in playlist_title_words.most_common(60)],
        "generatedFromSlices": len(slice_paths),
    }

    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (output_dir / "mood_profiles.json").write_text(json.dumps(category_output, indent=2), encoding="utf-8")
    (output_dir / "consensus.json").write_text(json.dumps(consensus_rows, indent=2), encoding="utf-8")
    (output_dir / "flow.json").write_text(json.dumps(flow_rows, indent=2), encoding="utf-8")

    summary["embedding"] = {
        "playlistCount": embedded_docs,
        "vectorSize": embedding_config.vector_size,
        "epochs": embedding_config.epochs,
        "vizSampleSize": embedding_summary.get("vizSampleSize", 0),
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote output files to: {output_dir}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process Spotify MPD slices for narrative visualization assets")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
        help="Path to the project's data directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "public" / "data",
        help="Directory where processed JSON files will be written",
    )
    parser.add_argument(
        "--max-slices",
        type=int,
        default=None,
        help="Optional cap for number of MPD slice files to process for faster iteration",
    )
    parser.add_argument(
        "--embedding-dim",
        type=int,
        default=128,
        help="Dimensionality of learned playlist embeddings",
    )
    parser.add_argument(
        "--embedding-epochs",
        type=int,
        default=12,
        help="Training epochs for streaming Doc2Vec",
    )
    parser.add_argument(
        "--embedding-viz-sample",
        type=int,
        default=14000,
        help="Number of playlist embeddings sampled for 2D cluster visualization",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    process_dataset(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        max_slices=args.max_slices,
        embedding_dim=args.embedding_dim,
        embedding_epochs=args.embedding_epochs,
        embedding_viz_sample=args.embedding_viz_sample,
    )


if __name__ == "__main__":
    main()
