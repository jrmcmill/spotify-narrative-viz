# How We Use Music: The Hidden Language of Spotify Playlists

SI649 Narrative Visualization Project (Winter 2026)

This repository contains:

- `pipeline/`: streaming preprocessing scripts for the Million Playlist Dataset (MPD)
- `web/`: a React + D3 scrollytelling narrative with interactive visualizations
- `data/`: source datasets (`track_features.csv` and MPD slices)

## Quick Start

1. Create or activate the Python environment, then install dependencies:

```bash
cd /Users/jonathan/git_repos/spotify-narrative-viz
source .venv/bin/activate
pip install -r pipeline/requirements.txt
```

2. Generate data assets. This streams through the MPD slices and writes the JSON files used by the web app:

```bash
python pipeline/process_data.py --max-slices 100
```

3. Generate the full assets from all 1,000 slices:

```bash
python pipeline/process_data.py
```

4. Optional: run the standalone artist counter if you only want the Artists Touched KPI artifact:

```bash
python pipeline/count_unique_artists.py --output-file web/public/data/artist_count.json
```

Embedding-focused runs for stronger Section 2 clusters:

```bash
# Fast iteration with a smaller corpus
python pipeline/process_data.py --max-slices 100 --embedding-epochs 6

# Full run with default streaming embedding settings
python pipeline/process_data.py --embedding-dim 128 --embedding-epochs 12 --embedding-viz-sample 14000
```

5. Run the web app:

```bash
cd web
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Build For GitHub Pages

```bash
cd web
npm run build
```

The production files are emitted in `web/dist/`.

A GitHub Actions workflow is included at `.github/workflows/deploy.yml` to publish automatically to GitHub Pages when changes are pushed to `main`.

## Narrative Sections

1. Hook: language of playlists (top words)
2. Playlist title clusters (embedding-based themes)
3. Sound of a mood (artists + audio features)
4. Consensus vs chaos (category agreement)
5. Playlist journey (feature flow over track position)

## Web Architecture

The page composition stays in React, while the chart rendering and transitions live inside the visual components in `web/src/visuals/`.

Each major visual has its own file so team members can work independently with fewer merge conflicts:

- `WordBarsViz.tsx`
- `TitleClustersViz.tsx`
- `MoodProfileViz.tsx`
- `ConsensusViz.tsx`
- `FlowViz.tsx`

Shared interaction state, including tooltip behavior, selected mood, and in-view triggers, stays in the parent app.

## Generated Data

The web app reads precomputed JSON from `web/public/data/`.

Key files include:

- `summary.json`: top-level KPIs, including `totalArtistsSeen` for Artists Touched
- `title_clusters.json`: embedding-based cluster points and labels
- `mood_profiles.json`: category-specific artist and feature summaries
- `consensus.json`: consensus and diversity metrics by category
- `flow.json`: track-position feature trajectories by category

## Streaming Embedding Method

Section 2 now uses learned playlist embeddings instead of title-only TF-IDF clusters.

Method summary:

- Model: Doc2Vec (PV-DBOW + word training via `dbow_words=1`)
- Document per playlist: title tokens + track-title tokens + artist tokens + optional category context tokens
- Streaming: training uses `corpus_file` so playlists are read from disk in passes, not loaded into memory all at once
- Output vectors: one learned embedding per playlist, written to `playlist_embeddings.npy` (`float32`, shape = `[num_playlists, embedding_dim]`)
- Visualization rendering: D3 handles scales, paths, and transitions inside the visualization components, while React owns layout and state

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
