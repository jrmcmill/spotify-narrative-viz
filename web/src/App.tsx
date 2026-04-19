import { MouseEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useInView } from './hooks/useInView'
import { useCountUp } from './hooks/useCountUp'
import { ALL_MOOD_OPTION, MOOD_HINT_KEYWORDS } from './visuals/constants'
import { ConsensusViz, FlowViz, MoodProfileViz, TitleClustersViz, WordBarsViz } from './visuals'
import type { ConsensusRow, FlowData, FlowPoint, MoodProfiles, Summary, TitleClusters, TooltipState } from './visuals/types'

function App() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [titleClusters, setTitleClusters] = useState<TitleClusters | null>(null)
  const [moodProfiles, setMoodProfiles] = useState<MoodProfiles | null>(null)
  const [consensus, setConsensus] = useState<ConsensusRow[] | null>(null)
  const [flow, setFlow] = useState<FlowData | null>(null)
  const [selectedMood, setSelectedMood] = useState<string>(ALL_MOOD_OPTION)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, text: '', x: 0, y: 0 })

  const heroRef = useInView()
  const wordBarsRef = useInView()
  const clustersRef = useInView()
  const moodRef = useInView()
  const consensusRef = useInView()
  const flowRef = useInView()

  useEffect(() => {
    const load = async () => {
      const [summaryRes, clustersRes, moodsRes, consensusRes, flowRes] = await Promise.all([
        fetch('data/summary.json'),
        fetch('data/title_clusters.json'),
        fetch('data/mood_profiles.json'),
        fetch('data/consensus.json'),
        fetch('data/flow.json'),
      ])

      const loadedSummary = (await summaryRes.json()) as Summary
      const loadedMoods = (await moodsRes.json()) as MoodProfiles

      setSummary(loadedSummary)
      setTitleClusters(await clustersRes.json())
      setMoodProfiles(loadedMoods)
      setConsensus(await consensusRes.json())
      setFlow(await flowRes.json())

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

  const activeFlow = useMemo(() => {
    if (!flow || moodNames.length === 0 || !moodProfiles) {
      return [] as FlowPoint[]
    }

    if (selectedMood !== ALL_MOOD_OPTION) {
      return flow[selectedMood] ?? flow[moodNames[0]] ?? []
    }

    const maxBins = Math.max(...moodNames.map((m) => (flow[m] ?? []).length), 0)
    const features: Array<keyof FlowPoint> = ['energy', 'valence', 'tempo']

    return Array.from({ length: maxBins }, (_, bin) => {
      const row: FlowPoint = { bin, energy: null, valence: null, tempo: null }
      features.forEach((feature) => {
        if (feature === 'bin') {
          return
        }
        let weightedSum = 0
        let totalWeight = 0
        moodNames.forEach((mood) => {
          const point = flow[mood]?.[bin]
          const value = point?.[feature]
          if (value === null || value === undefined) {
            return
          }
          const weight = moodProfiles[mood]?.playlists ?? 0
          weightedSum += value * weight
          totalWeight += weight
        })
        row[feature] = totalWeight > 0 ? weightedSum / totalWeight : null
      })
      return row
    })
  }, [flow, moodNames, moodProfiles, selectedMood])

  const playlistsCount = useCountUp(summary?.totalPlaylists ?? 0, !!summary, 1.2)
  const tracksCount = useCountUp(summary?.totalTracksSeen ?? 0, !!summary, 1.2)
  const artistsCount = useCountUp(summary?.totalArtistsSeen ?? derivedArtistsTouched, !!summary, 1.2)

  if (!summary || !titleClusters || !moodProfiles || !consensus || !flow) {
    return <main className="loading">Preparing the story view...</main>
  }

  const moodLabel = selectedMood === ALL_MOOD_OPTION ? 'all moods' : selectedMood.replace('_', ' ')

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
          <h1>How We Use Music: The Hidden Language of Spotify Playlists</h1>
          <p className="lede">
            People do not just listen to songs. They sort music into social rituals: focus, heartbreak, long drives,
            parties, and late-night spirals. This page maps those rituals from user-made Spotify playlists.
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

        <section className="story-block" ref={wordBarsRef.ref}>
          <h2 className={`fade-in-text ${wordBarsRef.isInView ? 'visible' : ''}`}>1. The Language of Playlists</h2>
          <p className={`fade-in-text ${wordBarsRef.isInView ? 'visible' : ''}`}>
            A few words dominate playlist names. They reveal the intents behind listening: emotions, routines, and
            identities. Mood focus: <strong>{moodLabel}</strong>.
          </p>
          <div className={`card ${wordBarsRef.isInView ? 'visible' : ''}`}>
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
        </section>

        <section className="story-block" ref={clustersRef.ref}>
          <h2 className={`fade-in-text ${clustersRef.isInView ? 'visible' : ''}`}>2. Theme Clusters in Titles</h2>
          <p className={`fade-in-text ${clustersRef.isInView ? 'visible' : ''}`}>
            We learned playlist embeddings from playlist language (title + track/artist tokens) and grouped them into
            clusters. Showing emphasis for <strong>{moodLabel}</strong>.
          </p>
          <div className={`card ${clustersRef.isInView ? 'visible' : ''}`}>
            <TitleClustersViz
              titleClusters={titleClusters}
              isInView={clustersRef.isInView}
              isPointMoodMatch={isPointMoodMatch}
              onTooltipEnter={onTooltipEnter}
              onTooltipMove={onTooltipMove}
              onTooltipLeave={onTooltipLeave}
            />
          </div>
        </section>

        <section className="story-block" ref={moodRef.ref}>
          <h2 className={`fade-in-text ${moodRef.isInView ? 'visible' : ''}`}>3. What Defines a Mood?</h2>
          <p className={`fade-in-text ${moodRef.isInView ? 'visible' : ''}`}>
            Current focus: <strong>{moodLabel}</strong>. Compare common artists and average audio properties.
          </p>
          <div className={`card ${moodRef.isInView ? 'visible' : ''}`}>
            <MoodProfileViz
              activeMood={activeMood}
              isInView={moodRef.isInView}
              onTooltipEnter={onTooltipEnter}
              onTooltipMove={onTooltipMove}
              onTooltipLeave={onTooltipLeave}
            />
          </div>
        </section>

        <section className="story-block" ref={consensusRef.ref}>
          <h2 className={`fade-in-text ${consensusRef.isInView ? 'visible' : ''}`}>4. Consensus vs Chaos</h2>
          <div className={`fade-in-text ${consensusRef.isInView ? 'visible' : ''}`}>
            <p>
              This visualization explores how consistently different Spotify moods are defined by comparing how much
              playlists rely on a shared set of songs versus a more diverse, individualized selection. Categories with
              higher top-track concentration show stronger shared definitions. As you explore this view, each bar
              represents how strongly a mood is built around a shared set of songs. Longer bars indicate higher
              consensus, meaning many playlists return to the same core tracks, while shorter bars suggest more
              variation across users.
            </p>
            <p>
              At the top, <strong>sad</strong> and <strong>hype</strong> stand out, with around 10% and 9%
              top-track concentration, showing that these moods tend to have a recognizable, widely shared sound. Even
              across thousands of playlists, people gravitate toward similar songs when defining these emotional
              spaces. As you move down, moods like <strong>romance</strong>, <strong>workout</strong>, and{' '}
              <strong>road trip</strong> begin to loosen, blending common patterns with more flexibility in song
              choice. By the time you reach <strong>sleep</strong> and <strong>study</strong>, the bars are noticeably
              shorter, revealing how much more personal and varied these categories are.
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
          <h2 className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>5. The Journey Inside Playlists</h2>
          <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
            Track order can tell a story. The curve below shows average feature trajectories from start to end for the
            selected scope: <strong>{moodLabel}</strong>.
          </p>
          <div className={`card ${flowRef.isInView ? 'visible' : ''}`}>
            <FlowViz
              activeFlow={activeFlow}
              moodLabel={moodLabel}
              isInView={flowRef.isInView}
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
