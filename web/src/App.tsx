import { MouseEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useInView } from './hooks/useInView'
import { useCountUp } from './hooks/useCountUp'
import { ALL_MOOD_OPTION, MOOD_HINT_KEYWORDS } from './visuals/constants'
import { ConsensusViz, FlowViz, MoodProfileViz, SummaryStatsViz, TitleClustersViz, WordBarsViz } from './visuals'
import type { ConsensusRow, FlowSamplePlaylist, FlowSamplesData, MoodProfiles, Summary, SummaryHistograms, TitleClusters, TooltipState } from './visuals/types'
import { SpotifyUserViz } from './visuals'


function App() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryHistograms, setSummaryHistograms] = useState<SummaryHistograms | null>(null)
  const [titleClusters, setTitleClusters] = useState<TitleClusters | null>(null)
  const [moodProfiles, setMoodProfiles] = useState<MoodProfiles | null>(null)
  const [consensus, setConsensus] = useState<ConsensusRow[] | null>(null)
  const [flowSamples, setFlowSamples] = useState<FlowSamplesData | null>(null)
  const [selectedMood, setSelectedMood] = useState<string>(ALL_MOOD_OPTION)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, text: '', x: 0, y: 0 })
  const [hasSummaryAnimated, setHasSummaryAnimated] = useState(false)

  const heroRef = useInView()
  const summaryRef = useInView()
  const wordBarsRef = useInView()
  const moodRef = useInView()
  const consensusRef = useInView()
  const flowRef = useInView()
  const spotifyRef = useInView()


  useEffect(() => {
    if (summaryRef.isInView && !hasSummaryAnimated) {
      setHasSummaryAnimated(true)
    }
  }, [hasSummaryAnimated, summaryRef.isInView])

  useEffect(() => {
    const load = async () => {
      const [summaryRes, histogramsRes, clustersRes, moodsRes, consensusRes, flowRes] = await Promise.all([
        fetch('data/summary.json'),
        fetch('data/summary_histograms.json'),
        fetch('data/title_clusters.json'),
        fetch('data/mood_profiles.json'),
        fetch('data/consensus.json'),
        fetch('data/flow_samples.json'),
      ])

      const loadedSummary = (await summaryRes.json()) as Summary
      const loadedMoods = (await moodsRes.json()) as MoodProfiles

      setSummary(loadedSummary)
      setSummaryHistograms(await histogramsRes.json())
      setTitleClusters(await clustersRes.json())
      setMoodProfiles(loadedMoods)
      setConsensus(await consensusRes.json())
      setFlowSamples(await flowRes.json())

      const moodNames = Object.keys(loadedMoods)
      if (moodNames.length > 0) {
        setSelectedMood((current) => (current === ALL_MOOD_OPTION || moodNames.includes(current) ? current : moodNames[0]))
      }
    }

    load().catch((err) => {
      console.error('Failed to load narrative data assets', err)
    })
  }, [])

  const moodNames = useMemo(() => (moodProfiles ? Object.keys(moodProfiles) : []), [moodProfiles])
  const moodOptions = useMemo(() => [ALL_MOOD_OPTION, ...moodNames], [moodNames])
  const selectedMoodKeywords = useMemo(() => new Set(MOOD_HINT_KEYWORDS[selectedMood] ?? []), [selectedMood])

  const derivedArtistsTouched = useMemo(() => {
    if (!moodProfiles) {
      return 0
    }

    const uniqueArtists = new Set<string>()
    Object.values(moodProfiles).forEach((profile) => {
      profile.topArtists.forEach((artist) => {
        uniqueArtists.add(artist.name)
      })
    })

    return uniqueArtists.size
  }, [moodProfiles])

  const allMoodAggregate = useMemo(() => {
    if (!moodProfiles) {
      return null
    }

    const artistCounts = new Map<string, number>()
    const featureWeightedSums = new Map<string, number>()
    let totalPlaylists = 0

    Object.values(moodProfiles).forEach((profile) => {
      const weight = profile.playlists
      totalPlaylists += weight

      profile.topArtists.forEach((artist) => {
        artistCounts.set(artist.name, (artistCounts.get(artist.name) ?? 0) + artist.count)
      })

      Object.entries(profile.avgFeatures).forEach(([key, value]) => {
        featureWeightedSums.set(key, (featureWeightedSums.get(key) ?? 0) + value * weight)
      })
    })

    const topArtists = [...artistCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)

    const avgFeatures: Record<string, number> = {}
    featureWeightedSums.forEach((sum, key) => {
      avgFeatures[key] = totalPlaylists > 0 ? sum / totalPlaylists : 0
    })

    return {
      playlists: totalPlaylists,
      topTracks: [],
      topArtists,
      avgFeatures,
      examples: [],
    }
  }, [moodProfiles])

  const activeMood = useMemo(() => {
    if (!moodProfiles || moodNames.length === 0) {
      return null
    }
    if (selectedMood === ALL_MOOD_OPTION) {
      return allMoodAggregate
    }
    return moodProfiles[selectedMood] ?? moodProfiles[moodNames[0]]
  }, [allMoodAggregate, moodNames, moodProfiles, selectedMood])

  const activeFlowSamples = useMemo(() => {
    if (!flowSamples || moodNames.length === 0) {
      return [] as FlowSamplePlaylist[]
    }

    if (selectedMood !== ALL_MOOD_OPTION) {
      return (flowSamples[selectedMood] ?? flowSamples[moodNames[0]] ?? []).slice(0, 10)
    }

    const pooled = moodNames.flatMap((mood) =>
      (flowSamples[mood] ?? []).map((sample) => ({
        ...sample,
        playlistName: `${sample.playlistName} [${mood.replace('_', ' ')}]`,
      })),
    )
    const seen = new Set<string>()
    const deduped = pooled.filter((sample) => {
      const key = sample.playlistName.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

    return deduped.slice(0, 10)
  }, [flowSamples, moodNames, selectedMood])

  const playlistsCount = useCountUp(summary?.totalPlaylists ?? 0, !!summary, 1.2)
  const tracksCount = useCountUp(summary?.totalTracksSeen ?? 0, !!summary, 1.2)
  const artistsCount = useCountUp(summary?.totalArtistsSeen ?? derivedArtistsTouched, !!summary, 1.2)

  if (!summary || !titleClusters || !moodProfiles || !consensus || !flowSamples || !summaryHistograms) {
    return <main className="loading">Preparing the story view...</main>
  }

  const moodLabel = selectedMood === ALL_MOOD_OPTION ? 'all moods' : selectedMood.replace('_', ' ')
  const summaryVisible = summaryRef.isInView || hasSummaryAnimated

  const isPointMoodMatch = (title: string) => {
    if (selectedMood === ALL_MOOD_OPTION) {
      return true
    }
    const value = title.toLowerCase()
    return [...selectedMoodKeywords].some((keyword) => value.includes(keyword))
  }

  const onTooltipEnter =
    (text: string) =>
    (event: MouseEvent<HTMLElement | SVGElement>): void => {
      setTooltip({ visible: true, text, x: event.clientX + 14, y: event.clientY + 14 })
    }

  const onTooltipMove = (event: MouseEvent<HTMLElement | SVGElement>): void => {
    setTooltip((current) =>
      current.visible
        ? {
            ...current,
            x: event.clientX + 14,
            y: event.clientY + 14,
          }
        : current,
    )
  }

  const onTooltipLeave = (): void => {
    setTooltip((current) => ({ ...current, visible: false }))
  }

  return (
    <main className="page-with-sidebar">
      <aside className="mood-sidebar">
        <div className="mood-sidebar-content">
          <h3 className="mood-sidebar-title">Explore Mood</h3>
          <p className="mood-sidebar-note">Applies starting in The Language of Playlists section below.</p>
          <div className="sidebar-mood-buttons">
            {moodOptions.map((mood) => (
              <button
                key={mood}
                className={mood === selectedMood ? 'mood-btn mood-btn-active' : 'mood-btn'}
                onClick={() => setSelectedMood(mood)}
                title={`Switch to ${mood} mood`}
              >
                {mood === ALL_MOOD_OPTION ? 'all' : mood.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="page">
        <section className="hero" ref={heroRef.ref}>
          <p className="eyebrow">SI649 Narrative Visualization Project</p>
          <p className="hero-credits">
            Haley Belardo (hmrichar) | Jillian Terrell (terrellj) | Jonathan McMillan (jrmcmill) | Paris Heard
            (pmheard)
          </p>
          <h1>How We Use Music: The Hidden Language of Spotify Playlists</h1>
          <p className="lede">
            What is in a playlist? People often use music to shape moments in life, from the everyday to the
            exceptional. On Spotify, playlists become containers for social rituals and emotional states: focus,
            heartbreak, long drives, workouts, parties, sleepless nights, and everything in between. The titles people
            choose, the songs they group together, and the order they place them in all reflect how music is used not
            only for entertainment, but for mood-setting, self-expression, and routine. This project explores those
            patterns through user-made Spotify playlists, tracing how listeners collectively organize songs into
            recognizable categories of feeling and experience.
          </p>
          <div className="stat-grid">
            <article className={`stat-card ${heroRef.isInView ? 'visible' : ''}`}>
              <p className="stat-label">Playlists Processed</p>
              <p className="stat-value">{playlistsCount.toLocaleString()}</p>
            </article>
            <article className={`stat-card ${heroRef.isInView ? 'visible' : ''}`}>
              <p className="stat-label">Tracks Touched</p>
              <p className="stat-value">{tracksCount.toLocaleString()}</p>
            </article>
            <article className={`stat-card ${heroRef.isInView ? 'visible' : ''}`}>
              <p className="stat-label">Artists Touched</p>
              <p className="stat-value">{artistsCount.toLocaleString()}</p>
            </article>
          </div>
        </section>

        <section className="story-block" ref={summaryRef.ref}>
          <h2 className={`fade-in-text ${summaryVisible ? 'visible' : ''}`}>Playlist Summaries</h2>
          <p className={`fade-in-text ${summaryVisible ? 'visible' : ''}`}>
            Before we get into the details, this section offers a broader view of the dataset as a whole. By looking at
            large-scale summary patterns first, we can start to see the overall shape of Spotify playlist culture
            before diving into specific title themes, mood structures, and listening behaviors.
          </p>
          <p className={`section-note ${summaryVisible ? 'visible' : ''}`}>
            The mood filter in the sidebar does not change these overview summaries. It begins affecting the visuals in
            the next section, <strong>The Language of Playlists</strong>.
          </p>
          <div className={`card ${summaryVisible ? 'visible' : ''}`}>
            <SummaryStatsViz
              moodProfiles={moodProfiles}
              summaryHistograms={summaryHistograms}
              isInView={summaryRef.isInView}
              hasAnimated={hasSummaryAnimated}
              onTooltipEnter={onTooltipEnter}
              onTooltipMove={onTooltipMove}
              onTooltipLeave={onTooltipLeave}
            />
          </div>
          <p className={`hero-guide summary-guide ${summaryVisible ? 'visible' : ''}`}>
            As you move through this page, follow how playlist titles, audio features, recurring songs, and track order
            together reveal the shared ways people build moods and meaning through music.
          </p>
        </section>

        <section className="story-block" ref={wordBarsRef.ref}>
          <h2 className={`fade-in-text ${wordBarsRef.isInView ? 'visible' : ''}`}>The Language of Playlists</h2>
          <p className={`fade-in-text ${wordBarsRef.isInView ? 'visible' : ''}`}>
            Across this million-playlist collection, titles act like tiny notes people leave for themselves and one
            another: what this music is for, what feeling it should hold, and what moment it belongs to. Seen at
            scale, those notes become a shared vocabulary of everyday listening.
          </p>
          <p className={`fade-in-text ${wordBarsRef.isInView ? 'visible' : ''}`}>
            This section reveals that vocabulary in two complementary ways. On the left, title clusters show recurring
            naming neighborhoods. On the right, top words show which terms dominate how people label playlists. Mood
            focus: <strong>{moodLabel}</strong>.
          </p>
          <p className={`fade-in-text ${wordBarsRef.isInView ? 'visible' : ''}`}>
            For example, we can see a top red cluster made up primarily of religious playlists, while the far-left
            blue cluster is made up primarily of Latin playlists.
          </p>
          <div className={`card language-layout ${wordBarsRef.isInView ? 'visible' : ''}`}>
            <p className="language-read-guide">
              How to read this view: clusters help you see broader themes; word bars show the strongest naming signals.
              Use the mood filter to compare how the language shifts from one context to another.
            </p>
            <div className="language-panel language-panel-clusters">
              <TitleClustersViz
                titleClusters={titleClusters}
                isInView={wordBarsRef.isInView}
                isPointMoodMatch={isPointMoodMatch}
                onTooltipEnter={onTooltipEnter}
                onTooltipMove={onTooltipMove}
                onTooltipLeave={onTooltipLeave}
              />
            </div>
            <div className="language-panel language-panel-words">
              <WordBarsViz
                topWords={summary.topWords}
                selectedMood={selectedMood}
                selectedMoodKeywords={selectedMoodKeywords}
                isInView={wordBarsRef.isInView}
                onTooltipEnter={onTooltipEnter}
                onTooltipMove={onTooltipMove}
                onTooltipLeave={onTooltipLeave}
              />
            </div>
          </div>
        </section>

        <section className="story-block" ref={moodRef.ref}>
        <h2 className={`fade-in-text ${moodRef.isInView ? 'visible' : ''}`}>What Defines a Mood?</h2>
        <div className={`fade-in-text ${moodRef.isInView ? 'visible' : ''}`}>
          <p>
            Music is rarely just background noise. Listeners reach for specific sounds to match or shift
            how they feel: to push through a tough workout, process a painful breakup, stay focused during finals, or set the
            mood for a late night drive. Spotify playlists make this behavior visible at a large scale: when
            a million people independently title their playlists "sad," "hype," or "study," they are
            collectively and socially defining what those moods sound like, and formulating their sonic trademark.
          </p>
          <p>
            Every mood has a sonic signature; a characteristic blend of energy, tempo, acousticness,
            and emotional tone that separates it from the rest. This section breaks down what audio
            features and artists define each mood, surfacing what makes it statistically distinct from
            the average playlist. Current focus: <strong>{moodLabel}</strong>.
          </p>
          <p>
            Not every mood is equally distinctive. <strong>Study</strong> stands apart most sharply;
            it is the most instrumental and slowest-tempo mood by a wide margin, built for distraction-free
            focus. <strong>Workout</strong> and <strong>hype</strong> cluster toward high energy and fast
            tempo, while <strong>sad</strong> pulls hard toward acousticness and low valence.{' '}
            <strong>Romance</strong>, surprisingly, sits close to average across nearly every feature,
            defined more by its artists than its sound alone.
          </p>
        </div>
        <div className={`card ${moodRef.isInView ? 'visible' : ''}`}>
          <MoodProfileViz
            activeMood={activeMood}
            moodProfiles={moodProfiles}
            selectedMood={selectedMood}
            isInView={moodRef.isInView}
            onTooltipEnter={onTooltipEnter}
            onTooltipMove={onTooltipMove}
            onTooltipLeave={onTooltipLeave}
          />
        </div>
        </section>

        <section className="story-block" ref={consensusRef.ref}>
          <h2 className={`fade-in-text ${consensusRef.isInView ? 'visible' : ''}`}>Consensus vs Chaos</h2>
          <div className={`fade-in-text ${consensusRef.isInView ? 'visible' : ''}`}>
            <p>
              This visualization explores how consistently different Spotify moods are defined by comparing how much
              playlists rely on a shared set of songs versus a more diverse, individualized selection.
              Categories with higher top-track concentration show stronger shared definitions.
              Current focus: <strong>{moodLabel}</strong>.
            </p>
            <p>
              At the top, <strong>sad</strong> and <strong>hype</strong> stand out, with around 10% and 9%
              top-track concentration, showing that these moods tend to have a recognizable, widely shared sound.
              As you move down, moods like <strong>romance</strong>, <strong>workout</strong>, and{' '}
              <strong>road trip</strong> begin to loosen. By the time you reach <strong>sleep</strong> and{' '}
              <strong>study</strong>, the bars are noticeably shorter, revealing more personal variation.
            </p>
          </div>
          <div className={`card ${consensusRef.isInView ? 'visible' : ''}`}>
            <ConsensusViz
              consensus={consensus}
              moodProfiles={moodProfiles}
              selectedMood={selectedMood}
              isInView={consensusRef.isInView}
              onTooltipEnter={onTooltipEnter}
              onTooltipMove={onTooltipMove}
              onTooltipLeave={onTooltipLeave}
            />
          </div>
        </section>

        <section className="story-block" ref={flowRef.ref}>
          <h2 className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>The Journey Inside Playlists</h2>
          <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
            Playlists are not just collections of songs; they are often arranged as sequences. A quiet opening, a
            lift in the middle, a landing at the end. Looking at order helps us see how listeners shape attention,
            energy, and emotion over time.
          </p>
          <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
            Each line below traces one real playlist from start to finish for a selected audio feature. Compare
            examples from <strong>{moodLabel}</strong> to see whether journeys feel gradual, dramatic, or deliberately
            steady.
          </p>
          <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
            For example, when you select <strong>Energy</strong>, playlists in moods like <strong>hype</strong> and{' '}
            <strong>workout</strong> tend to sit higher overall than many <strong>sad</strong> playlists.
          </p>
          <div className={`card ${flowRef.isInView ? 'visible' : ''}`}>
            <p className="flow-read-guide">
              How to read this view: left-to-right is playlist order, and up-and-down shows the chosen feature level.
              Switch features to compare different kinds of movement, and hover points for track-level snapshots.
            </p>
            <FlowViz
              activeFlowSamples={activeFlowSamples}
              moodLabel={moodLabel}
              isInView={flowRef.isInView}
              onTooltipEnter={onTooltipEnter}
              onTooltipMove={onTooltipMove}
              onTooltipLeave={onTooltipLeave}
            />
          </div>
        </section>

        <section className="story-block" ref={spotifyRef.ref}>
          <h2 className={`fade-in-text ${spotifyRef.isInView ? 'visible' : ''}`}>Where Do You Fit?</h2>
          <div className={`fade-in-text ${spotifyRef.isInView ? 'visible' : ''}`}>
            <p>
              The patterns above emerge from a million playlists — but every listener's
              library tells its own version of this story. Connect your Spotify account
              to see how your top tracks map onto the mood categories we found across
              the dataset, and where your taste sits relative to the mainstream.
            </p>
          </div>
          <div className="card visible">
            <SpotifyUserViz
              moodProfiles={moodProfiles}
              onTooltipEnter={onTooltipEnter}
              onTooltipMove={onTooltipMove}
              onTooltipLeave={onTooltipLeave}
            />
          </div>
        </section>

        <section className="closing" ref={flowRef.ref}>
          <h2 className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>Conclusion</h2>
          <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
            Playlist titles and ordering patterns expose a hidden folk taxonomy of music use. Spotify users are
            collectively annotating songs with context: who we are, what we feel, and what moment we are trying to
            build.
          </p>
        </section>

        <section className="story-block appendix-section">
          <h2>Appendix: Methods and Data Processing</h2>
          <p>
            This appendix documents how each visualization was built from the Spotify Million Playlist Dataset (MPD)
            and track-level audio features. The goal is transparency: an educated reader should be able to understand
            what was computed, why, and where approximations were used.
          </p>

          <h3>Data Sources and Scope</h3>
          <ul className="appendix-list">
            <li>
              Playlist data: Spotify MPD slices at <code>data/spotify_million_playlist_dataset/data/mpd.slice.*.json</code>.
            </li>
            <li>
              Audio features: <code>data/track_features.csv</code> keyed by Spotify track ID.
            </li>
            <li>
              Category mapping: keyword dictionary in <code>pipeline/keywords.py</code> with seven narrative moods:
              sad, hype, study, workout, sleep, road_trip, romance.
            </li>
            <li>
              A playlist can belong to multiple moods if multiple keyword rules match its normalized title.
            </li>
          </ul>

          <h3>Processing Pipeline (High Level)</h3>
          <pre className="appendix-diagram">{`MPD slices + track_features.csv
        |
        v
pipeline/process_data.py
  |- summary.json (counts + top title words)
  |- mood_profiles.json (per-mood top artists/tracks + avg features)
  |- consensus.json (per-mood concentration metrics)
  |- flow.json (aggregate per-mood trajectories; not the final journey view)
  |- playlist_embedding_corpus.txt + playlist_embedding_meta.jsonl
        |
        v
streaming Doc2Vec training (pipeline/streaming_embeddings.py)
  |- title_clusters.json (2D playlist points + cluster labels)
  |- embedding_similarity.json (mood centroid cosine matrix)
  |- embedding_config.json / playlist_embeddings.npy

Additional specialized builders:
  |- pipeline/build_flow_samples.py -> flow_samples.json (real playlist trajectories)
  |- pipeline/build_summary_histograms.py -> summary_histograms.json`}</pre>

          <h3>Method Details by Visual</h3>

          <h4>1) Playlist Summaries</h4>
          <ul className="appendix-list">
            <li>
              Inputs: <code>summary.json</code>, <code>mood_profiles.json</code>, and <code>summary_histograms.json</code>.
            </li>
            <li>
              Top words come from normalized playlist titles (regex tokenization, stop-word filtering, numeric token
              filtering) in <code>pipeline/process_data.py</code>.
            </li>
            <li>
              Top artists and songs panel aggregates per-mood frequency tables already computed in
              <code> mood_profiles.json</code>.
            </li>
            <li>
              Histogram distributions are computed over all playlists in
              <code> pipeline/build_summary_histograms.py</code>:
              unique artist count per playlist and track count per playlist.
            </li>
            <li>
              Histogram buckets are dynamically sized to target up to 15 bins: bucket size is approximately
              <code> ceil((max-min)/15)</code>, then counts are accumulated by bucket range.
            </li>
          </ul>

          <h4>2) The Language of Playlists</h4>
          <ul className="appendix-list">
            <li>
              Word bars use the same title-token counter from <code>summary.json</code> (global frequency).
            </li>
            <li>
              Cluster scatter uses embedding artifacts from <code>title_clusters.json</code>, generated by
              <code> pipeline/streaming_embeddings.py</code>.
            </li>
            <li>
              Document construction for each playlist includes weighted title tokens, matched mood context tokens,
              and truncated track/artist tokens (to keep long playlists from dominating token mass).
            </li>
            <li>
              Embeddings: streaming Doc2Vec (PV-DBOW with word training), default vector size 128, 12 epochs,
              trained from disk-backed corpus files.
            </li>
            <li>
              Visualization projection: sample up to 14,000 playlists, cluster with MiniBatchKMeans, then project to
              2D with UMAP (cosine metric).
            </li>
          </ul>

          <h4>3) What Defines a Mood?</h4>
          <ul className="appendix-list">
            <li>
              Uses <code>mood_profiles.json</code> built in <code>pipeline/process_data.py</code>.
            </li>
            <li>
              For every mood-matched playlist, track and artist frequencies are accumulated.
            </li>
            <li>
              Mean audio-feature profiles are computed by summing matched tracks with available feature rows and
              dividing by the number of matched featured tracks.
            </li>
            <li>
              Reported features include danceability, energy, valence, tempo, acousticness, and instrumentalness.
            </li>
          </ul>

          <h4>4) Consensus vs Chaos</h4>
          <ul className="appendix-list">
            <li>
              Uses <code>consensus.json</code> from <code>pipeline/process_data.py</code>.
            </li>
            <li>
              Track concentration is measured on per-mood track presence across playlists (whether a track appears,
              not repeated occurrences in a single playlist).
            </li>
            <li>
              Two key metrics are produced per mood:
              <code>top50AvgShare</code> (mean playlist share of the 50 most prevalent tracks) and
              <code>simpson</code> (sum of squared track shares).
            </li>
            <li>
              Higher values indicate stronger shared canon; lower values indicate more diffuse, individualized track
              selection.
            </li>
          </ul>

          <h4>5) The Journey Inside Playlists</h4>
          <ul className="appendix-list">
            <li>
              Uses <code>flow_samples.json</code> from <code>pipeline/build_flow_samples.py</code>, not mood-average
              curves.
            </li>
            <li>
              For each eligible playlist, track order is normalized to 20 relative-position bins (0 to 19), and bin
              means are computed for energy, valence, and tempo.
            </li>
            <li>
              Eligibility requires at least 8 tracks with feature rows (default); this avoids extremely sparse flow
              lines.
            </li>
            <li>
              To avoid memory blow-up while staying representative at scale, each mood keeps a fixed-size random sample
              (default 10 playlists) via reservoir sampling with a fixed seed.
            </li>
            <li>
              Hover song examples are selected by evenly spaced index sampling across each playlist (up to 5 songs).
            </li>
          </ul>

          <h3>Important Caveats</h3>
          <ul className="appendix-list">
            <li>
              Mood labels are keyword-rule based, not human-annotated classes; ambiguous titles can map to multiple
              moods.
            </li>
            <li>
              Any track missing in <code>track_features.csv</code> is excluded from feature-based aggregates and flow
              statistics.
            </li>
            <li>
              Title embeddings and 2D projections are stochastic methods with fixed random seeds for reproducibility,
              but local neighborhood geometry is still approximate.
            </li>
            <li>
              The visuals emphasize interpretable summary structure rather than strict causal inference.
            </li>
          </ul>
        </section>
      </div>

      {tooltip.visible ? (
        <div className="viz-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      ) : null}
    </main>
  )
}

export default App
