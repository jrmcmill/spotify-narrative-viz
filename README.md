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
python pipeline/build_flow_samples.py --max-slices 100
python pipeline/build_summary_histograms.py --max-slices 100
```

3. Generate the full assets from all 1,000 slices:

```bash
python pipeline/process_data.py
python pipeline/build_flow_samples.py
python pipeline/build_summary_histograms.py
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

1. Playlist Summaries (KPIs, top artists/songs, artist/track count histograms)
2. The Language of Playlists (top words + embedding-based title clusters)
3. What Defines a Mood? (artists + audio features)
4. Consensus vs Chaos (category agreement/concentration)
5. The Journey Inside Playlists (sampled real-playlist trajectories)
6. Appendix (methodology and processing details)

## Web Architecture

The page composition stays in React, while the chart rendering and transitions live inside the visual components in `web/src/visuals/`.

Each major visual has its own file so team members can work independently with fewer merge conflicts:

- `WordBarsViz.tsx`
- `TitleClustersViz.tsx`
- `MoodProfileViz.tsx`
- `ConsensusViz.tsx`
- `FlowViz.tsx`

Shared interaction state, including tooltip behavior, selected mood, and in-view triggers, stays in the parent app.

## Team Workflow By Visual

This project is structured so each teammate can own one visual with minimal overlap.

### Core files every visual owner should know

- `web/src/App.tsx`
	- Parent composition, section order, shared tooltip handlers, selected mood state, in-view hooks.
	- You usually only touch this file if you need to add/remove props for your visual.
- `web/src/visuals/types.ts`
	- Shared TypeScript contracts for data and shared interactions.
	- Update this if your visual needs a new typed prop or shape.
- `web/src/visuals/constants.ts`
	- Cross-visual constants such as mood keywords and shared color lists.
- `web/src/App.css`
	- Shared styling and animation classes used across sections.
	- Keep section-specific class names scoped to avoid side effects.

### Visual ownership map

1. Section 1, The Language of Playlists
- Primary file: `web/src/visuals/WordBarsViz.tsx`
- Data inputs: `summary.topWords`, `selectedMood`, `selectedMoodKeywords`
- Shared dependencies to watch: tooltip handlers from `App.tsx`, bar classes in `App.css`

2. Section 2, Theme Clusters in Titles
- Primary file: `web/src/visuals/TitleClustersViz.tsx`
- Data inputs: `titleClusters`, `selectedMood` highlighting via `isPointMoodMatch`
- Shared dependencies to watch: `CLUSTER_COLORS` in `constants.ts`, one-time in-view animation behavior

3. Section 3, What Defines a Mood?
- Primary file: `web/src/visuals/MoodProfileViz.tsx`
- Data inputs: `activeMood.topArtists`, `activeMood.avgFeatures`
- Shared dependencies to watch: mood selection logic in `App.tsx`, axis label styling in `App.css`

4. Section 4, Consensus vs Chaos
- Primary file: `web/src/visuals/ConsensusViz.tsx`
- Data inputs: `consensus`, `selectedMood`
- Shared dependencies to watch: shared tooltip contracts, consensus list and scatter classes in `App.css`

5. Section 5, The Journey Inside Playlists
- Primary file: `web/src/visuals/FlowViz.tsx`
- Data inputs: `activeFlowSamples`, `moodLabel`
- Shared dependencies to watch: axis styles, flow legend styles, line animation behavior

### Data files per visual

- Section 1 reads from `web/public/data/summary.json`
- Section 2 reads from `web/public/data/title_clusters.json`
- Section 3 reads from `web/public/data/mood_profiles.json`
- Section 4 reads from `web/public/data/consensus.json`
- Section 5 reads from `web/public/data/flow_samples.json`
- Section 1 histogram distributions read from `web/public/data/summary_histograms.json`
- KPI cards at top read from `web/public/data/summary.json` (including `totalArtistsSeen`)

### Pipeline files to change when data requirements change

- `pipeline/process_data.py`
	- Main streaming generator for all web JSON assets.
	- Update here if a visual needs a new field in `summary.json`, `mood_profiles.json`, `consensus.json`, or cluster metadata.
- `pipeline/build_flow_samples.py`
	- Builds sampled real-playlist trajectory data for Section 5 into `flow_samples.json`.
- `pipeline/build_summary_histograms.py`
	- Builds artist/track count distribution histograms for Section 1 into `summary_histograms.json`.
- `pipeline/count_unique_artists.py`
	- Standalone utility for computing `totalArtistsSeen`.

### Recommended per-visual development flow

1. Regenerate a small local dataset for fast iteration:

```bash
python pipeline/process_data.py --max-slices 100
```

2. Run web dev server from `web/`:

```bash
npm install
npm run dev
```

3. Work only in your visual file first, then touch shared files only if necessary.

4. Validate before pushing:

```bash
cd web
npm run build
```

5. If your change modifies generated data shape, include pipeline updates and regenerated JSON artifacts in the same PR.

### Merge-conflict guardrails

- Prefer local visual logic inside `web/src/visuals/<YourVisual>.tsx`.
- Avoid editing `App.tsx` unless changing the visual interface.
- Avoid broad CSS edits; add section-specific class names.
- Keep `types.ts` changes additive and backwards compatible when possible.
- If changing shared constants, check other visuals for accidental behavior changes.

## Generated Data

The web app reads precomputed JSON from `web/public/data/`.

Key files include:

- `summary.json`: top-level KPIs, including `totalArtistsSeen` for Artists Touched
- `title_clusters.json`: embedding-based cluster points and labels
- `mood_profiles.json`: category-specific artist and feature summaries
- `consensus.json`: consensus and diversity metrics by category
- `flow_samples.json`: sampled real-playlist track-position trajectories by category
- `summary_histograms.json`: histogram buckets and stats for artists/song counts per playlist

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
