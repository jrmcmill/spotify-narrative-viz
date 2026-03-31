from __future__ import annotations

import argparse
import json
from pathlib import Path

from gensim.models.doc2vec import Doc2Vec

from keywords import CATEGORY_KEYWORDS, STOP_WORDS
from streaming_embeddings import build_category_similarity, build_embedding_clusters


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rebuild embedding-derived artifacts (2D clusters + category similarity) from saved model"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "public" / "data",
        help="Directory containing playlist_doc2vec.model and playlist_embedding_meta.jsonl",
    )
    parser.add_argument(
        "--embedding-viz-sample",
        type=int,
        default=14000,
        help="Number of playlist embeddings sampled for 2D visualization",
    )
    parser.add_argument(
        "--random-seed",
        type=int,
        default=42,
        help="Random seed for sampling/projection reproducibility",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir

    model_path = output_dir / "playlist_doc2vec.model"
    meta_path = output_dir / "playlist_embedding_meta.jsonl"

    if not model_path.exists():
        raise FileNotFoundError(f"Missing model file: {model_path}")
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing metadata file: {meta_path}")

    print(f"Loading saved embedding model: {model_path}")
    model = Doc2Vec.load(str(model_path))

    clusters = build_embedding_clusters(
        model=model,
        meta_path=meta_path,
        stop_words=list(STOP_WORDS),
        max_points=args.embedding_viz_sample,
        random_seed=args.random_seed,
    )
    (output_dir / "title_clusters.json").write_text(json.dumps(clusters, indent=2), encoding="utf-8")
    print(f"Wrote: {output_dir / 'title_clusters.json'}")

    similarity = build_category_similarity(
        model=model,
        meta_path=meta_path,
        categories=list(CATEGORY_KEYWORDS.keys()),
    )
    (output_dir / "embedding_similarity.json").write_text(json.dumps(similarity, indent=2), encoding="utf-8")
    print(f"Wrote: {output_dir / 'embedding_similarity.json'}")

    print("Done. Rebuilt embedding-derived artifacts without retraining.")


if __name__ == "__main__":
    main()
