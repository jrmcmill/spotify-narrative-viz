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
  const journeyRef = useInView()
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
            <p>
            What is in a playlist? On the surface, a playlist is just a list of songs. But if you look closely at
            their chosen names, you'll find a new meaning emerges: "late night drives," "crying in the club,"
            "beast mode," "sunday morning coffee," a living anthology of how music is used and experienced.
            Music is more than just what sounds people like, it reflects what they need, what they feel,
            and how the world is perceived through their lens. People use it to shape moments in their lives, from the everyday to the
            exceptional.
            </p>
            <p>
            On Spotify, playlists become containers for social rituals and emotional states: focus,
            heartbreak, roadtrips, workouts, parties, sleepless nights, protests, and everything in between. The titles they
            choose, the songs they group together, and the order they place them in all reflect how music is used not
            only for entertainment, but for mood-setting, self-expression, routine, and cultural experience. This project explores this
            behavior at scale, drawing on one million user-created Spotify playlists, tracing how listeners collectively organize music into
            recognizable categories, and what they say about the hidden grammar of everyday listening.
            </p>
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
            <p>
            Before we get into the details, this section offers a broader view of the dataset as a whole. One million
            playlists, over nine million tracks, nearly three hundred thousand distinct artists; the scale alone is a story.
            A few patterns stand out immediately: Drake appears in more playlists than any other artist by a wide margin, and the
            median playlist holds 49 songs, which is long enough to carry a mood through an entire afternoon.
            </p>
            <p>
            These summary numbers set the stage. The real patterns emerge when we look deeper into how playlists are labeled,
            structured, and shaped by the people who make them.
            </p>
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
            <p>
              Across this million-playlist collection, titles act like tiny notes people leave for themselves and one
              another: what this music is for, what feeling it should hold, and what moment it belongs to. Seen at
              scale, those notes become a shared vocabulary of everyday listening.
            </p>
            <p>
              This section reveals that vocabulary in two complementary ways. The cluster visualization on the left groups playlists
              by naming similarity, surfacing recurring neighborhoods of meaning, from Latin music and religious worship
              to holiday playlists and throwbacks. The word bars on the right show which terms dominate overall.
              "Country," "summer," and "chill" lead the list, suggesting that genre, season, and mood are
              the three primary axes along which people label their listening.
            </p>
            <p>
              What is particularly striking is how consistent this language is across millions of independent
              creators. There was no large-scale coordination on labeling a playlist "vibes". Nobody agreed to
              use the word "jams" for songs. Yet, these words appear tens of thousands of times, revealing evidence
              that playlist titles are more than just a personal label, but a folk taxnomy that describes a
              shared cultural vocabulary for describing what music does and how it feels.
            </p>
          <div className={`card language-layout ${wordBarsRef.isInView ? 'visible' : ''}`}>
            <p className="language-read-guide">
              How to read this view: Clusters help you see broader themes; word bars show the strongest naming signals.
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
            how they feel: to push through a tough workout, process a painful breakup, stay focused during a 
            late-night study session, or set the mood for a long drive. Spotify playlists make this behavior visible at a large scale. 
            When a million people independently title their playlists "sad," "hype," or "study," they are
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
              If moods have sonic fingerprints, do they also have canoncial songs? This
              section explores how consistently differrent moods are defined by comparing how much
              playlists rely on a shared set of tracks versus a more diverse, individualized selection. 
              Are there certain songs that are so strongly associated with a mood that they appear in many different 
              playlists labeled with that mood? Or do people take a more personal, idiosyncratic approach to building 
              their mood playlists, with less agreement on which songs belong? Current focus: <strong>{moodLabel}</strong>.
            </p>
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
            <p>
              This distinction maps onto something intuitive. Hype and sad are social moods
              — playlists made to share, to party to, or to commiserate over. Study and sleep
              are private moods — playlists made for yourself, tuned to your own rhythms. The
              data reflects that difference. Collective moods converge. Personal moods
              diverge.
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

        <section className="story-block" ref={journeyRef.ref}>
          <h2 className={`fade-in-text ${journeyRef.isInView ? 'visible' : ''}`}>The Journey Inside Playlists</h2>
          <p className={`fade-in-text ${journeyRef.isInView ? 'visible' : ''}`}>
            Playlists are not just collections of songs; they are often arranged as sequences. A quiet opening, a
            lift in the middle, a landing at the end. The order of tracks is itself a form of expression: it controls how a mood builds,
            peaks, and resolves.
          </p>
          <p className={`fade-in-text ${journeyRef.isInView ? 'visible' : ''}`}>
            This section allows you to trace that arc. Each line below follows one real playlist from start to finish,
            plotting how energy, emotional valence, or tempo shifts across the listening experience.
            Some playlists build steadily toward a peak. Others start hard and taper off. Many hold steady, with a
            deliberate flatline that sustains a feeling rather than transforming it.
            Compare examples from <strong>{moodLabel}</strong> to see whether journies feel gradual, dramatic, or deliberately steady.
          </p>
          <p className={`fade-in-text ${journeyRef.isInView ? 'visible' : ''}`}>
            Workout and hype playlists tend to open strong and stay there. Sad playlists
            often dip lower as they progress. Study playlists are remarkably consistent —
            which makes sense for music designed to disappear into the background. These
            trajectories aren't random. They reflect choices listeners make, consciously or
            not, about how to shape an experience over time.
          </p>
          <div className={`card ${journeyRef.isInView ? 'visible' : ''}`}>
            <p className="flow-read-guide">
              How to read this view: Left-to-right is playlist order, and up-and-down shows the chosen feature level.
              Switch features to compare different kinds of movement, and hover points for track-level snapshots.
            </p>
            <FlowViz
              activeFlowSamples={activeFlowSamples}
              moodLabel={moodLabel}
              isInView={journeyRef.isInView}
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
            <p>
            Note: if your top artists don't appear in our dataset, that's not a bug — it's
            a finding. The Million Playlist Dataset was collected in 2017, and listeners
            whose taste skews toward newer or more niche artists will fall outside the
            cultural snapshot this data represents. That gap is itself part of the story.
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
            <p>
            Playlist titles and track ordering patterns expose what might be called a folk
            taxonomy of music use: a bottom-up classification system built not by music
            critics or algorithms, but by millions of listeners independently deciding what
            a song is for.
            </p>
            <p>
            Across a million playlists, clear structures emerge. Moods cluster around
            recognizable sonic profiles. Some categories converge on shared anthems; others
            stay stubbornly personal. Playlists are arranged in arcs that reflect how
            people want to feel over time, not just in a single moment. And the language
            people use to name these collections, "chill," "vibes," "banger," "feels,"
            reveals a shared emotional vocabulary that nobody designed, but everyone
            continually understands.
            </p>
            <p>
            What this dataset cannot fully capture is change. Collected in 2017, it is a
            snapshot of Spotify culture at a particular moment; before whole genres and
            artist communities reshaped what mainstream listening looked like. The listeners
            whose top tracks today fall entirely outside this dataset aren't outliers; they
            are evidence that the taxonomy is always evolving, always being rewritten by
            whoever picks up a phone and hits play.
            </p>
            <p>
            Music has always been used to organize emotional life. What Spotify makes
            visible — and what a million playlists make legible — is just how collectively,
            and how consistently, we do it.
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
