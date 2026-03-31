from __future__ import annotations

import json
import os
import importlib
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import numpy as np
from sklearn.cluster import MiniBatchKMeans
from sklearn.decomposition import TruncatedSVD


@dataclass
class EmbeddingConfig:
    vector_size: int = 128
    window: int = 10
    min_count: int = 3
    negative: int = 10
    epochs: int = 12
    workers: int = max(1, (os.cpu_count() or 2) - 1)
    max_viz_points: int = 14000
    random_seed: int = 42


def _parse_meta_line(line: str) -> Dict[str, object]:
    return json.loads(line)


def _iter_meta(meta_path: Path) -> Iterable[tuple[int, Dict[str, object]]]:
    with meta_path.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            if not line.strip():
                continue
            yield idx, _parse_meta_line(line)


def train_doc2vec_model(corpus_path: Path, config: EmbeddingConfig):
    """Train Doc2Vec using corpus_file so training streams from disk instead of RAM."""
    try:
        doc2vec_module = importlib.import_module("gensim.models.doc2vec")
        Doc2Vec = getattr(doc2vec_module, "Doc2Vec")
    except ImportError as exc:
        raise RuntimeError(
            "gensim is required for streaming embeddings. Install via: pip install gensim==4.3.3"
        ) from exc

    model = Doc2Vec(
        vector_size=config.vector_size,
        window=config.window,
        min_count=config.min_count,
        negative=config.negative,
        dm=0,
        dbow_words=1,
        workers=config.workers,
        epochs=config.epochs,
        seed=config.random_seed,
    )

    model.build_vocab(corpus_file=str(corpus_path))
    model.train(
        corpus_file=str(corpus_path),
        total_examples=model.corpus_count,
        total_words=model.corpus_total_words,
        epochs=model.epochs,
    )
    return model


def write_embedding_matrix(model, output_path: Path) -> int:
    """Write all playlist embeddings to disk as a float32 .npy matrix without holding all vectors in memory."""
    count = len(model.dv)
    vec_dim = model.vector_size
    mmap = np.lib.format.open_memmap(output_path, mode="w+", dtype=np.float32, shape=(count, vec_dim))
    for i in range(count):
        mmap[i] = model.dv[i]
    del mmap
    return count


def build_embedding_clusters(
    model,
    meta_path: Path,
    stop_words: Sequence[str],
    max_points: int,
    random_seed: int,
) -> Dict[str, object]:
    """Create 2D embedding visualization points and cluster summaries from a sampled set of playlists."""
    total = len(model.dv)
    if total == 0:
        return {"points": [], "clusters": []}

    sample_size = min(max_points, total)
    rng = np.random.default_rng(random_seed)
    sample_indices = np.sort(rng.choice(total, size=sample_size, replace=False))
    sample_idx_set = set(int(i) for i in sample_indices)

    sampled_meta: Dict[int, Dict[str, object]] = {}
    for idx, meta in _iter_meta(meta_path):
        if idx in sample_idx_set:
            sampled_meta[idx] = meta
        if len(sampled_meta) == sample_size:
            break

    vectors = np.vstack([model.dv[int(i)] for i in sample_indices]).astype(np.float32)
    n_clusters = min(10, max(4, sample_size // 1300))

    kmeans = MiniBatchKMeans(
        n_clusters=n_clusters,
        random_state=random_seed,
        batch_size=1024,
        n_init="auto",
    )
    labels = kmeans.fit_predict(vectors)

    svd = TruncatedSVD(n_components=2, random_state=random_seed)
    coords = svd.fit_transform(vectors)

    sw = set(stop_words)
    label_words = defaultdict(Counter)

    points = []
    for row_idx, doc_idx in enumerate(sample_indices):
        meta = sampled_meta.get(int(doc_idx), {})
        title = str(meta.get("title") or "Untitled playlist")
        track_count = int(meta.get("trackCount") or 1)
        cluster = int(labels[row_idx])

        for token in title.lower().split():
            t = token.strip()
            if len(t) <= 2 or t.isdigit() or t in sw:
                continue
            label_words[cluster][t] += 1

        points.append(
            {
                "title": title,
                "count": max(1, track_count),
                "x": float(coords[row_idx, 0]),
                "y": float(coords[row_idx, 1]),
                "cluster": cluster,
            }
        )

    clusters = []
    for cluster_id in range(n_clusters):
        cluster_mask = labels == cluster_id
        cluster_size = int(cluster_mask.sum())
        top_terms = [w for w, _ in label_words[cluster_id].most_common(5)]
        if not top_terms:
            top_terms = [f"cluster {cluster_id}"]

        clusters.append(
            {
                "id": cluster_id,
                "label": ", ".join(top_terms[:3]),
                "topTerms": top_terms,
                "size": cluster_size,
                "weight": cluster_size,
            }
        )

    return {"points": points, "clusters": clusters}


def build_category_similarity(model, meta_path: Path, categories: Sequence[str]) -> Dict[str, object]:
    """Compute centroid-based cosine similarity matrix between mood categories."""
    vec_dim = model.vector_size
    sums = {c: np.zeros(vec_dim, dtype=np.float64) for c in categories}
    counts = {c: 0 for c in categories}

    for idx, meta in _iter_meta(meta_path):
        cats = meta.get("categories") or []
        if not cats:
            continue
        vec = np.asarray(model.dv[idx], dtype=np.float64)
        for c in cats:
            if c in sums:
                sums[c] += vec
                counts[c] += 1

    centroids: Dict[str, np.ndarray] = {}
    for c in categories:
        if counts[c] == 0:
            centroids[c] = np.zeros(vec_dim, dtype=np.float64)
            continue
        v = sums[c] / counts[c]
        norm = np.linalg.norm(v)
        centroids[c] = v / norm if norm > 0 else v

    matrix = []
    for c1 in categories:
        row = {"category": c1}
        v1 = centroids[c1]
        for c2 in categories:
            v2 = centroids[c2]
            score = float(np.dot(v1, v2)) if np.linalg.norm(v1) > 0 and np.linalg.norm(v2) > 0 else 0.0
            row[c2] = round(score, 4)
        matrix.append(row)

    return {
        "centroidCounts": counts,
        "cosineSimilarity": matrix,
    }


def write_embedding_artifacts(
    model,
    meta_path: Path,
    output_dir: Path,
    categories: Sequence[str],
    stop_words: Sequence[str],
    config: EmbeddingConfig,
) -> Dict[str, object]:
    embeddings_path = output_dir / "playlist_embeddings.npy"
    vector_count = write_embedding_matrix(model, embeddings_path)

    clusters = build_embedding_clusters(
        model=model,
        meta_path=meta_path,
        stop_words=stop_words,
        max_points=config.max_viz_points,
        random_seed=config.random_seed,
    )
    (output_dir / "title_clusters.json").write_text(json.dumps(clusters, indent=2), encoding="utf-8")

    similarity = build_category_similarity(model=model, meta_path=meta_path, categories=categories)
    (output_dir / "embedding_similarity.json").write_text(json.dumps(similarity, indent=2), encoding="utf-8")

    config_payload = {
        "method": "Doc2Vec (PV-DBOW + word training)",
        "streaming": {
            "corpusFileTraining": True,
            "fullMatrixOnDisk": str(embeddings_path.name),
            "metadataFile": str(meta_path.name),
        },
        "hyperparameters": {
            "vectorSize": config.vector_size,
            "window": config.window,
            "minCount": config.min_count,
            "negative": config.negative,
            "epochs": config.epochs,
        },
        "playlistCount": vector_count,
        "vizSampleSize": len(clusters.get("points", [])),
    }
    (output_dir / "embedding_config.json").write_text(json.dumps(config_payload, indent=2), encoding="utf-8")

    return config_payload
