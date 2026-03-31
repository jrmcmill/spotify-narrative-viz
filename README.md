# How We Use Music: The Hidden Language of Spotify Playlists

SI649 Narrative Visualization Project (Winter 2026)

This repository contains:

- `pipeline/`: efficient preprocessing scripts for the Million Playlist Dataset (MPD)
- `web/`: a one-page scrollytelling narrative with interactive visualizations
- `data/`: source datasets (`track_features.csv` and MPD slices)

## Quick Start

1. Install Python dependencies:

```bash
/Users/jonathan/opt/anaconda3/bin/python -m pip install -r pipeline/requirements.txt
```

2. Generate data assets (fast dev sample):

```bash
/Users/jonathan/opt/anaconda3/bin/python pipeline/process_data.py --max-slices 100
```

3. Generate full assets (all 1,000 slices):

```bash
/Users/jonathan/opt/anaconda3/bin/python pipeline/process_data.py
```

Embedding-focused runs (for stronger Section 2 clusters):

```bash
# Fast iteration with smaller corpus
/Users/jonathan/opt/anaconda3/bin/python pipeline/process_data.py --max-slices 100 --embedding-epochs 6

# Full run with default streaming embedding settings
/Users/jonathan/opt/anaconda3/bin/python pipeline/process_data.py --embedding-dim 128 --embedding-epochs 12 --embedding-viz-sample 14000
```

4. Run the web app:

```bash
cd web
npm install
npm run dev
```

## Build For GitHub Pages

```bash
cd web
npm run build
```

The production files are emitted in `web/dist/`.

A GitHub Actions workflow is included at `.github/workflows/deploy.yml` to publish automatically to GitHub Pages when changes are pushed to `main`.

## Narrative Sections

1. Hook: language of playlists (top words)
2. Playlist title clusters (NLP-based themes)
3. Sound of a mood (artists + audio features)
4. Consensus vs chaos (category agreement)
5. Playlist journey (feature flow over track position)

## Streaming Embedding Method

Section 2 now uses learned playlist embeddings instead of title-only TF-IDF clusters.

Method summary:

- Model: Doc2Vec (PV-DBOW + word training via `dbow_words=1`)
- Document per playlist: title tokens + track-title tokens + artist tokens + optional category context tokens
- Streaming: training uses `corpus_file` so playlists are read from disk in passes, not loaded into memory all at once
- Output vectors: one learned embedding per playlist, written to `playlist_embeddings.npy` (`float32`, shape = `[num_playlists, embedding_dim]`)

Generated embedding artifacts in `web/public/data/`:

- `playlist_embedding_corpus.txt`: tokenized training corpus (one playlist document per line)
- `playlist_embedding_meta.jsonl`: metadata aligned to embedding row index (title, trackCount, categories)
- `playlist_doc2vec.model`: trained gensim model
- `playlist_embeddings.npy`: dense embedding matrix for similarity/search tasks
- `title_clusters.json`: embedding-projected 2D points + cluster metadata for the narrative view
- `embedding_similarity.json`: centroid-based cosine similarity across narrative categories
- `embedding_config.json`: model hyperparameters and run metadata

Why this is better for playlist semantics:

- Uses playlist language beyond title-only signals (track titles + artists)
- Learns co-occurrence structure from whole playlist documents
- Supports downstream clustering and similarity with reusable vectors
- Keeps memory bounded during training on the full MPD
