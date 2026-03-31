import { CSSProperties, MouseEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useInView } from './hooks/useInView'
import { useCountUp } from './hooks/useCountUp'

type CSSWithCustomProperties = CSSProperties & {
  '--target-width'?: string
}

type Summary = {
  totalPlaylists: number
  totalTracksSeen: number
  categories: Record<string, number>
  topWords: Array<{ word: string; count: number }>
  generatedFromSlices: number
}

type TitleClusters = {
  points: Array<{ title: string; count: number; x: number; y: number; cluster: number }>
  clusters: Array<{ id: number; label: string; topTerms: string[]; size: number; weight: number }>
}

type MoodProfiles = Record<
  string,
  {
    playlists: number
    topTracks: Array<{ name: string; count: number }>
    topArtists: Array<{ name: string; count: number }>
    avgFeatures: Record<string, number>
    examples: string[]
  }
>

type ConsensusRow = {
  category: string
  playlists: number
  simpson: number
  top50AvgShare: number
  uniqueTracks: number
}

type FlowPoint = {
  bin: number
  energy: number | null
  valence: number | null
  tempo: number | null
}

type FlowData = Record<string, FlowPoint[]>

type TooltipState = {
  visible: boolean
  text: string
  x: number
  y: number
}

const CLUSTER_COLORS = ['#0f4c81', '#f28c28', '#1f7a3f', '#8a3b12', '#7d2e68', '#177e89', '#b33939', '#4b5563']
const ALL_MOOD_OPTION = 'all'
const MOOD_HINT_KEYWORDS: Record<string, string[]> = {
  sad: ['sad', 'cry', 'heartbreak', 'breakup', 'depressed', 'lonely', 'pain', 'tears', 'feels'],
  hype: ['hype', 'lit', 'party', 'banger', 'rage', 'club', 'dance'],
  study: ['study', 'focus', 'deep', 'homework', 'coding', 'productivity', 'lofi', 'instrumental'],
  workout: ['gym', 'workout', 'running', 'run', 'lifting', 'cardio', 'training', 'exercise'],
  sleep: ['sleep', 'bedtime', 'night', 'calm', 'meditation', 'ambient', 'rain', 'rest', 'relax'],
  road_trip: ['road', 'trip', 'driving', 'car', 'highway', 'travel', 'adventure'],
  romance: ['love', 'romance', 'wedding', 'date', 'valentine', 'crush', 'kiss'],
}

function App() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [titleClusters, setTitleClusters] = useState<TitleClusters | null>(null)
  const [moodProfiles, setMoodProfiles] = useState<MoodProfiles | null>(null)
  const [consensus, setConsensus] = useState<ConsensusRow[] | null>(null)
  const [flow, setFlow] = useState<FlowData | null>(null)
  const [selectedMood, setSelectedMood] = useState<string>(ALL_MOOD_OPTION)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, text: '', x: 0, y: 0 })

  // Call all hooks at the top level before any conditional returns
  const heroRef = useInView()
  const wordBarsRef = useInView()
  const clustersRef = useInView()
  const moodRef = useInView()
  const consensusRef = useInView()
  const flowRef = useInView()

  const playlistsCount = useCountUp(summary?.totalPlaylists ?? 0, !!summary, 1.2)
  const tracksCount = useCountUp(summary?.totalTracksSeen ?? 0, !!summary, 1.2)
  const slicesCount = useCountUp(summary?.generatedFromSlices ?? 0, !!summary, 1.2)

  useEffect(() => {
    const load = async () => {
      const [summaryRes, clustersRes, moodsRes, consensusRes, flowRes] = await Promise.all([
        fetch('data/summary.json'),
        fetch('data/title_clusters.json'),
        fetch('data/mood_profiles.json'),
        fetch('data/consensus.json'),
        fetch('data/flow.json'),
      ])

      setSummary(await summaryRes.json())
      setTitleClusters(await clustersRes.json())
      const moods = (await moodsRes.json()) as MoodProfiles
      setMoodProfiles(moods)
      setConsensus(await consensusRes.json())
      setFlow(await flowRes.json())

      const moodNames = Object.keys(moods)
      if (moodNames.length > 0) {
        setSelectedMood((current) => (current === ALL_MOOD_OPTION || moodNames.includes(current) ? current : moodNames[0]))
      }
    }

    load().catch((err) => {
      console.error('Failed to load narrative data assets', err)
    })
  }, [])

  const clusterBounds = useMemo(() => {
    if (!titleClusters || titleClusters.points.length === 0) {
      return null
    }

    const xs = titleClusters.points.map((p) => p.x)
    const ys = titleClusters.points.map((p) => p.y)
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
  }, [titleClusters])

  const moodNames = useMemo(() => (moodProfiles ? Object.keys(moodProfiles) : []), [moodProfiles])
  const moodOptions = useMemo(() => [ALL_MOOD_OPTION, ...moodNames], [moodNames])
  const selectedMoodKeywords = useMemo(
    () => new Set(MOOD_HINT_KEYWORDS[selectedMood] ?? []),
    [selectedMood],
  )

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

  const consensusRows = useMemo(() => {
    if (!consensus) {
      return []
    }
    if (selectedMood === ALL_MOOD_OPTION) {
      return consensus
    }
    return consensus.filter((row) => row.category === selectedMood)
  }, [consensus, selectedMood])

  const consensusFocus = useMemo(() => {
    if (!consensus || selectedMood === ALL_MOOD_OPTION) {
      return null
    }

    const enriched = consensus.map((row) => ({
      ...row,
      uniquePerPlaylist: row.playlists > 0 ? row.uniqueTracks / row.playlists : 0,
    }))

    const selected = enriched.find((row) => row.category === selectedMood)
    if (!selected) {
      return null
    }

    const topShareSorted = [...enriched].sort((a, b) => b.top50AvgShare - a.top50AvgShare)
    const chaosSorted = [...enriched].sort((a, b) => b.uniquePerPlaylist - a.uniquePerPlaylist)
    const shareRank = topShareSorted.findIndex((row) => row.category === selectedMood) + 1
    const chaosRank = chaosSorted.findIndex((row) => row.category === selectedMood) + 1

    const xs = enriched.map((row) => row.top50AvgShare)
    const ys = enriched.map((row) => row.uniquePerPlaylist)
    const medianX = topShareSorted[Math.floor(topShareSorted.length / 2)]?.top50AvgShare ?? selected.top50AvgShare
    const medianY = chaosSorted[Math.floor(chaosSorted.length / 2)]?.uniquePerPlaylist ?? selected.uniquePerPlaylist

    return {
      rows: enriched,
      selected,
      shareRank,
      chaosRank,
      total: enriched.length,
      bounds: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        medianX,
        medianY,
      },
    }
  }, [consensus, selectedMood])

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
            <p className="stat-label">Slices Loaded</p>
            <p className="stat-value">{slicesCount.toLocaleString()}</p>
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
          <ul className="word-bars">
            {summary.topWords.slice(0, 24).map((item, idx) => {
              const width = (item.count / summary.topWords[0].count) * 100
              const delayMs = wordBarsRef.isInView ? idx * 30 : 0
              const moodHit = selectedMood === ALL_MOOD_OPTION || selectedMoodKeywords.has(item.word)
              return (
                <li
                  key={item.word}
                  className={`word-bar-item ${moodHit ? 'mood-highlight' : 'mood-dim'}`}
                  style={{ animationDelay: `${delayMs}ms` }}
                  onMouseEnter={onTooltipEnter(`${item.word}: ${item.count.toLocaleString()} playlists`)}
                  onMouseMove={onTooltipMove}
                  onMouseLeave={onTooltipLeave}
                >
                  <span className="word-label">{item.word}</span>
                  <div className="word-track">
                    <div className={`word-fill ${wordBarsRef.isInView ? 'animated' : ''}`} style={{ '--target-width': `${width}%` } as CSSWithCustomProperties} />
                  </div>
                  <span className="word-count">{item.count.toLocaleString()}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="story-block" ref={clustersRef.ref}>
        <h2 className={`fade-in-text ${clustersRef.isInView ? 'visible' : ''}`}>2. Theme Clusters in Titles</h2>
        <p className={`fade-in-text ${clustersRef.isInView ? 'visible' : ''}`}>
          We learned playlist embeddings from playlist language (title + track/artist tokens) and grouped them into
          clusters. Showing emphasis for <strong>{moodLabel}</strong>.
        </p>
        <div className={`card ${clustersRef.isInView ? 'visible' : ''}`}>
          {clusterBounds ? (
            <svg viewBox="0 0 900 460" className="clusters-svg" role="img" aria-label="Playlist title clusters">
              <rect x="0" y="0" width="900" height="460" className="clusters-bg" />
              {titleClusters.points.slice(0, 2200).map((point, idx) => {
                const x =
                  40 +
                  ((point.x - clusterBounds.minX) / Math.max(0.0001, clusterBounds.maxX - clusterBounds.minX)) * 820
                const y =
                  420 -
                  ((point.y - clusterBounds.minY) / Math.max(0.0001, clusterBounds.maxY - clusterBounds.minY)) * 380
                const radius = Math.min(7, 2 + Math.log10(point.count + 1))
                const delayMs = clustersRef.isInView ? (idx % 40) * 12 : 0
                const moodHit = isPointMoodMatch(point.title)
                return (
                  <circle
                    key={`${point.title}-${point.cluster}`}
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={CLUSTER_COLORS[point.cluster % CLUSTER_COLORS.length]}
                    fillOpacity={moodHit ? 0.75 : 0.16}
                    stroke={moodHit ? '#102a43' : 'none'}
                    strokeWidth={moodHit ? 0.5 : 0}
                    className={clustersRef.isInView ? 'cluster-point-animate' : ''}
                    style={{ animationDelay: `${delayMs}ms` }}
                    onMouseEnter={onTooltipEnter(
                      `${point.title} (${point.count.toLocaleString()}) - ${moodHit ? 'matches selected mood' : 'outside selected mood emphasis'}`,
                    )}
                    onMouseMove={onTooltipMove}
                    onMouseLeave={onTooltipLeave}
                  />
                )
              })}
            </svg>
          ) : null}
          <div className="cluster-legend">
            {titleClusters.clusters.map((cluster) => (
              <div
                key={cluster.id}
                className="legend-item"
                onMouseEnter={onTooltipEnter(`${cluster.topTerms.join(', ')} | ${cluster.weight.toLocaleString()} playlists`)}
                onMouseMove={onTooltipMove}
                onMouseLeave={onTooltipLeave}
              >
                <span
                  className="legend-color"
                  style={{ backgroundColor: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length] }}
                />
                <div>
                  <p>{cluster.label}</p>
                  <small>{cluster.weight.toLocaleString()} titles</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="story-block" ref={moodRef.ref}>
        <h2 className={`fade-in-text ${moodRef.isInView ? 'visible' : ''}`}>3. What Defines a Mood?</h2>
        <p className={`fade-in-text ${moodRef.isInView ? 'visible' : ''}`}>Current focus: <strong>{moodLabel}</strong>. Compare common artists and average audio properties.</p>
        <div className={`card ${moodRef.isInView ? 'visible' : ''}`}>
          <div className="mood-grid">
            <div>
              <h3>Top Artists</h3>
              <ul className="rank-list">
                {activeMood?.topArtists.slice(0, 10).map((artist, idx) => (
                  <li
                    key={artist.name}
                    className="rank-item"
                    style={{ animationDelay: `${moodRef.isInView ? idx * 40 : 0}ms` }}
                    onMouseEnter={onTooltipEnter(`${artist.name}: ${artist.count.toLocaleString()} playlist appearances`)}
                    onMouseMove={onTooltipMove}
                    onMouseLeave={onTooltipLeave}
                  >
                    <span>{artist.name}</span>
                    <strong>{artist.count.toLocaleString()}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Average Audio Features</h3>
              <ul className="feature-list">
                {Object.entries(activeMood?.avgFeatures ?? {}).map(([key, value], idx) => {
                  const normalized = key === 'tempo' ? Math.min(1, value / 200) : Math.max(0, Math.min(1, value))
                  return (
                    <li
                      key={key}
                      className="feature-item"
                      style={{ animationDelay: `${moodRef.isInView ? idx * 40 : 0}ms` }}
                      onMouseEnter={onTooltipEnter(`${key}: ${value.toFixed(2)}`)}
                      onMouseMove={onTooltipMove}
                      onMouseLeave={onTooltipLeave}
                    >
                      <div className="feature-header">
                        <span>{key}</span>
                        <span>{value.toFixed(2)}</span>
                      </div>
                      <div className="feature-track">
                        <div className={`feature-fill ${moodRef.isInView ? 'animated' : ''}`} style={{ '--target-width': `${normalized * 100}%` } as CSSWithCustomProperties} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="story-block" ref={consensusRef.ref}>
        <h2 className={`fade-in-text ${consensusRef.isInView ? 'visible' : ''}`}>4. Consensus vs Chaos</h2>
        <p className={`fade-in-text ${consensusRef.isInView ? 'visible' : ''}`}>
          Categories with higher top-track concentration show stronger shared definitions. Now filtered for <strong>{moodLabel}</strong>.
        </p>
        <div className={`card ${consensusRef.isInView ? 'visible' : ''}`}>
          <ul className="consensus-list">
            {consensusRows.map((row, idx) => {
              const width = Math.max(2, row.top50AvgShare * 1000)
              return (
                <li
                  key={row.category}
                  className={`consensus-item ${row.category === selectedMood ? 'consensus-item-selected' : ''}`}
                  style={{ animationDelay: `${consensusRef.isInView ? idx * 50 : 0}ms` }}
                  onMouseEnter={onTooltipEnter(
                    `${row.category}: ${(row.top50AvgShare * 100).toFixed(2)}% avg top-50 share, ${row.uniqueTracks.toLocaleString()} unique tracks`,
                  )}
                  onMouseMove={onTooltipMove}
                  onMouseLeave={onTooltipLeave}
                >
                  <div className="consensus-meta">
                    <span>{row.category.replace('_', ' ')}</span>
                    <small>
                      {row.playlists.toLocaleString()} playlists • {row.uniqueTracks.toLocaleString()} unique tracks
                    </small>
                  </div>
                  <div className="consensus-track">
                    <div className={`consensus-fill ${consensusRef.isInView ? 'animated' : ''}`} style={{ '--target-width': `${Math.min(width, 100)}%` } as CSSWithCustomProperties} />
                  </div>
                  <strong>{(row.top50AvgShare * 100).toFixed(2)}%</strong>
                </li>
              )
            })}
          </ul>

          {consensusFocus ? (
            <div className="consensus-focus-panel">
              <div className="consensus-focus-header">
                <h3>Mood Position Map</h3>
                <p>
                  <strong>{consensusFocus.selected.category.replace('_', ' ')}</strong> ranks #{consensusFocus.shareRank}/
                  {consensusFocus.total} on consensus strength and #{consensusFocus.chaosRank}/{consensusFocus.total} on
                  diversity pressure.
                </p>
              </div>
              <svg viewBox="0 0 900 310" className="consensus-scatter" role="img" aria-label="Consensus versus diversity position map">
                <rect x="0" y="0" width="900" height="310" className="flow-bg" />
                <line x1="80" y1="240" x2="860" y2="240" stroke="#cbd5e0" strokeWidth="1.5" />
                <line x1="80" y1="40" x2="80" y2="240" stroke="#cbd5e0" strokeWidth="1.5" />

                <line
                  x1={80 + ((consensusFocus.bounds.medianX - consensusFocus.bounds.minX) / Math.max(0.0001, consensusFocus.bounds.maxX - consensusFocus.bounds.minX)) * 780}
                  y1="40"
                  x2={80 + ((consensusFocus.bounds.medianX - consensusFocus.bounds.minX) / Math.max(0.0001, consensusFocus.bounds.maxX - consensusFocus.bounds.minX)) * 780}
                  y2="240"
                  stroke="#9fb3c8"
                  strokeDasharray="6 5"
                  opacity="0.8"
                />
                <line
                  x1="80"
                  y1={240 - ((consensusFocus.bounds.medianY - consensusFocus.bounds.minY) / Math.max(0.0001, consensusFocus.bounds.maxY - consensusFocus.bounds.minY)) * 200}
                  x2="860"
                  y2={240 - ((consensusFocus.bounds.medianY - consensusFocus.bounds.minY) / Math.max(0.0001, consensusFocus.bounds.maxY - consensusFocus.bounds.minY)) * 200}
                  stroke="#9fb3c8"
                  strokeDasharray="6 5"
                  opacity="0.8"
                />

                <text x="96" y="56" className="consensus-quadrant-label">Shared but Diverse</text>
                <text x="648" y="56" className="consensus-quadrant-label">Strong Consensus</text>
                <text x="96" y="228" className="consensus-quadrant-label">Niche and Fragmented</text>
                <text x="648" y="228" className="consensus-quadrant-label">Cohesive Mainstream</text>

                {consensusFocus.rows.map((row) => {
                  const x =
                    80 +
                    ((row.top50AvgShare - consensusFocus.bounds.minX) /
                      Math.max(0.0001, consensusFocus.bounds.maxX - consensusFocus.bounds.minX)) *
                      780
                  const y =
                    240 -
                    ((row.uniquePerPlaylist - consensusFocus.bounds.minY) /
                      Math.max(0.0001, consensusFocus.bounds.maxY - consensusFocus.bounds.minY)) *
                      200
                  const selected = row.category === selectedMood
                  return (
                    <g key={row.category}>
                      <circle
                        cx={x}
                        cy={y}
                        r={selected ? 8 : 5}
                        fill={selected ? '#f28c28' : '#6b7c93'}
                        stroke={selected ? '#8a3b12' : 'none'}
                        strokeWidth={selected ? 2 : 0}
                        opacity={selected ? 1 : 0.65}
                        onMouseEnter={onTooltipEnter(
                          `${row.category}: consensus ${(row.top50AvgShare * 100).toFixed(2)}%, diversity pressure ${row.uniquePerPlaylist.toFixed(2)} unique tracks/playlist`,
                        )}
                        onMouseMove={onTooltipMove}
                        onMouseLeave={onTooltipLeave}
                      />
                      {selected ? (
                        <text x={x + 10} y={y - 8} className="consensus-selected-label">
                          {row.category.replace('_', ' ')}
                        </text>
                      ) : null}
                    </g>
                  )
                })}

                <text x="470" y="275" className="axis-title" textAnchor="middle">
                  Consensus Strength (Top-50 Avg Share)
                </text>
                <text x="26" y="145" className="axis-title" textAnchor="middle" transform="rotate(-90 26 145)">
                  Diversity Pressure (Unique Tracks / Playlist)
                </text>
                <text x="862" y="252" className="consensus-guide-label" textAnchor="end">
                  Median splits shown as dashed guides
                </text>
              </svg>
            </div>
          ) : null}
        </div>
      </section>

      <section className="story-block" ref={flowRef.ref}>
        <h2 className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>5. The Journey Inside Playlists</h2>
        <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
          Track order can tell a story. The curve below shows average feature trajectories from start to end for the
          selected scope: <strong>{moodLabel}</strong>.
        </p>
        <div className={`card ${flowRef.isInView ? 'visible' : ''}`}>
          <svg viewBox="0 0 900 350" className={`flow-svg ${flowRef.isInView ? 'visible' : ''}`} role="img" aria-label="Playlist flow chart">
            <defs>
              <linearGradient id="grid-fade" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f5f5f5" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f5f5f5" stopOpacity="0" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="900" height="350" className="flow-bg" />
            <rect x="70" y="20" width="800" height="260" fill="url(#grid-fade)" />

            <line x1="70" y1="20" x2="70" y2="280" stroke="#cbd5e0" strokeWidth="2" />
            <line x1="70" y1="280" x2="870" y2="280" stroke="#cbd5e0" strokeWidth="2" />

            {[0, 0.25, 0.5, 0.75, 1].map((val) => {
              const y = 280 - val * 260
              return (
                <g key={`y-tick-${val}`}>
                  <line x1="60" y1={y} x2="70" y2={y} stroke="#cbd5e0" strokeWidth="1.5" opacity="0.6" />
                  <text x="55" y={y} textAnchor="end" dominantBaseline="middle" className="axis-label" fontSize="12" fill="#627d98">
                    {val === 0 ? '0' : `${Math.round(val * 100)}`}
                  </text>
                </g>
              )
            })}

            {[0, 0.5, 1].map((pos) => {
              const x = 70 + pos * 800
              const label = pos === 0 ? 'Start' : pos === 0.5 ? 'Middle' : 'End'
              return (
                <g key={`x-tick-${pos}`}>
                  <line x1={x} y1="280" x2={x} y2="292" stroke="#cbd5e0" strokeWidth="1.5" opacity="0.6" />
                  <text x={x} y="308" textAnchor="middle" className="axis-label" fontSize="12" fill="#627d98">
                    {label}
                  </text>
                </g>
              )
            })}

            <text x="20" y="150" textAnchor="middle" className="axis-title" fontSize="11" fontWeight="600" fill="#102a43" transform="rotate(-90 20 150)">
              Feature Value (0-100)
            </text>
            <text x="470" y="330" textAnchor="middle" className="axis-title" fontSize="11" fontWeight="600" fill="#102a43">
              Playlist Progress
            </text>

            {(['energy', 'valence', 'tempo'] as const).map((feature, featureIdx) => {
              const color = ['#0f4c81', '#f28c28', '#177e89'][featureIdx]
              const path = activeFlow
                .map((point, i) => {
                  const raw = point[feature]
                  if (raw === null) {
                    return null
                  }
                  const normalized = feature === 'tempo' ? Math.min(1, raw / 200) : raw
                  const x = 70 + (i / Math.max(1, activeFlow.length - 1)) * 800
                  const y = 280 - normalized * 260
                  return `${x},${y}`
                })
                .filter(Boolean)
                .join(' ')

              if (!path) {
                return null
              }

              return (
                <polyline
                  key={feature}
                  points={path}
                  fill="none"
                  stroke={color}
                  strokeWidth="3"
                  className={flowRef.isInView ? 'flow-line-animate' : ''}
                  opacity="0.85"
                  onMouseEnter={onTooltipEnter(`${feature} trajectory for ${moodLabel}`)}
                  onMouseMove={onTooltipMove}
                  onMouseLeave={onTooltipLeave}
                />
              )
            })}
          </svg>
          <div className="flow-legend">
            <span
              className="flow-chip energy"
              onMouseEnter={onTooltipEnter('Higher means more intensity')}
              onMouseMove={onTooltipMove}
              onMouseLeave={onTooltipLeave}
            >
              Energy
            </span>
            <span
              className="flow-chip valence"
              onMouseEnter={onTooltipEnter('Higher means more positive mood')}
              onMouseMove={onTooltipMove}
              onMouseLeave={onTooltipLeave}
            >
              Valence (happiness)
            </span>
            <span
              className="flow-chip tempo"
              onMouseEnter={onTooltipEnter('Normalized BPM trend')}
              onMouseMove={onTooltipMove}
              onMouseLeave={onTooltipLeave}
            >
              Tempo (speed)
            </span>
          </div>
        </div>
      </section>

      <section className="closing" ref={flowRef.ref}>
        <h2 className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>Conclusion</h2>
        <p className={`fade-in-text ${flowRef.isInView ? 'visible' : ''}`}>
          Playlist titles and ordering patterns expose a hidden folk taxonomy of music use. Spotify users are
          collectively annotating songs with context: who we are, what we feel, and what moment we are trying to build.
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
