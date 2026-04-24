# Web App

This folder contains the React + TypeScript + Vite app for the Spotify narrative visualization.

The visuals are composed in React, while D3 is used inside the individual visualization components for scales, drawing, and transitions.

## Run Locally

1. From the repository root, make sure the generated data files exist in `web/public/data/`.
2. Install dependencies:

```bash
cd /Users/jonathan/git_repos/spotify-narrative-viz/web
npm install
```

3. Start the dev server:

```bash
npm run dev
```

4. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Build

```bash
npm run build
```

The production bundle is written to `web/dist/`.

## Visual Structure

Each major visualization lives in its own file under `web/src/visuals/`:

- `SummaryStatsViz.tsx`
- `WordBarsViz.tsx`
- `TitleClustersViz.tsx`
- `MoodProfileViz.tsx`
- `ConsensusViz.tsx`
- `FlowViz.tsx`

Shared state such as the selected mood, tooltip behavior, and scroll-triggered visibility remains in `web/src/App.tsx`.

## Data Dependencies

The app expects the following generated files in `web/public/data/`:

- `summary.json`
- `summary_histograms.json`
- `title_clusters.json`
- `mood_profiles.json`
- `consensus.json`
- `flow_samples.json`

Optional/auxiliary artifacts that are not required for the app's core rendering:

- `artist_count.json` (standalone utility output)
- `embedding_similarity.json`
- `embedding_config.json`
- `playlist_embeddings.npy`
- `playlist_doc2vec.model`
