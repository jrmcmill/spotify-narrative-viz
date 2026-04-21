import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import type { MoodProfile, MoodProfiles, TooltipHandlers } from './types'

// ── Mood metadata ─────────────────────────────────────────────────────────────
const MOOD_META: Record<string, { label: string; emoji: string; color: string }> = {
  all:       { label: 'All Moods', emoji: '🎵', color: '#0f4c81' },
  hype:      { label: 'Hype',      emoji: '🔥', color: '#e63946' },
  workout:   { label: 'Workout',   emoji: '💪', color: '#f4a261' },
  road_trip: { label: 'Road Trip', emoji: '🚗', color: '#2a9d8f' },
  romance:   { label: 'Romance',   emoji: '💕', color: '#e76f51' },
  study:     { label: 'Study',     emoji: '📚', color: '#457b9d' },
  sad:       { label: 'Sad',       emoji: '🌧️', color: '#6b8cae' },
  sleep:     { label: 'Sleep',     emoji: '🌙', color: '#8ecae6' },
}

// ── Feature display metadata ──────────────────────────────────────────────────
const FEATURE_META: Record<string, {
  label: string
  description: string
  isRaw?: boolean
  rawMax?: number
  highWord: string   // adjective when significantly high
  lowWord: string    // adjective when significantly low
}> = {
  energy:           { label: 'Energy',        description: 'Perceived intensity and activity level',           highWord: 'high-energy',    lowWord: 'low-energy',     isRaw: false, rawMax: 1 },
  danceability:     { label: 'Danceability',  description: 'How suitable for dancing (rhythm, beat strength)', highWord: 'highly danceable', lowWord: 'not very danceable', isRaw: false, rawMax: 1 },
  valence:          { label: 'Valence',       description: 'Musical positivity — high = happy, low = sad',    highWord: 'upbeat',          lowWord: 'emotionally heavy', isRaw: false, rawMax: 1 },
  acousticness:     { label: 'Acousticness',  description: 'Likelihood the track uses acoustic instruments',  highWord: 'acoustic',        lowWord: 'electronic',     isRaw: false, rawMax: 1 },
  instrumentalness: { label: 'Instrumental',  description: 'Predicts whether a track has no vocals',          highWord: 'instrumental',    lowWord: 'vocal-forward',  isRaw: false, rawMax: 1 },
  tempo:            { label: 'Tempo',         description: 'Beats per minute (normalized to 200 BPM max)',    highWord: 'fast-tempo',      lowWord: 'slow-tempo',     isRaw: true,  rawMax: 200 },
}

const FEATURE_ORDER = ['energy', 'danceability', 'valence', 'acousticness', 'instrumentalness', 'tempo']

// ── Narrative templates ───────────────────────────────────────────────────────
// Each entry: [high narrative, low narrative]
// Written knowing which moods actually have significant deviations from the z-score analysis.
const FEATURE_NARRATIVES: Record<string, [string, string]> = {
  energy: [
    'The tracks here hit hard — energy levels are well above average, built for movement and intensity.',
    'These playlists are intentionally subdued — energy is lower than most moods, favoring calm over intensity.',
  ],
  danceability: [
    'The rhythms here are made to move to — danceability is among the highest of any mood.',
    'These tracks aren\'t built for the dancefloor — the beats are irregular or restrained compared to other moods.',
  ],
  valence: [
    'The mood here skews bright and positive — musically, these playlists feel good.',
    'This is one of the most emotionally heavy moods in the dataset — low valence tracks dominate.',
  ],
  acousticness: [
    'Acoustic instruments define this mood — guitars, pianos, and voices with minimal production.',
    'This mood leans heavily produced and electronic — very few acoustic instruments in the mix.',
  ],
  instrumentalness: [
    'Vocals take a back seat here — a striking share of tracks are purely instrumental, unusual for any mood.',
    'These playlists are voice-forward — lyrics and vocals are central to the listening experience.',
  ],
  tempo: [
    'The tempo here is notably faster than most moods — designed to keep energy and pace elevated.',
    'These playlists move at a slower pace — the tempo is lower than average, reinforcing a sense of ease or drift.',
  ],
}

// Fallback narrative when no features are statistically significant
const BLAND_NARRATIVES: Record<string, string> = {
  romance: 'Romance is musically middle-of-the-road — no single audio feature stands out. What defines it isn\'t the sound, but the artists: familiar voices associated with love, longing, and slow dances.',
  road_trip: 'Road trip playlists sit close to the overall average across most features — energetic but not extreme, upbeat but not euphoric. The defining quality is versatility: music that works mile after mile.',
  all: 'Across all moods, the audio features cluster near the middle — which makes sense, since these are averages of averages. The real story emerges when you select a specific mood.',
}

// ── Outlier computation ───────────────────────────────────────────────────────
type Outlier = {
  feature: string
  z: number
  value: number
  direction: 'high' | 'low'
  narrative: string
}

function computeOutliers(
  activeMood: MoodProfile,
  allMoods: MoodProfiles,
  threshold = 0.8
): Outlier[] {
  const moodKeys = Object.keys(allMoods)

  // Cross-mood mean and std per feature (normalized values)
  const normalize = (key: string, val: number) =>
    FEATURE_META[key]?.isRaw ? Math.min(1, val / (FEATURE_META[key].rawMax ?? 200)) : val

  const crossMoodVals: Record<string, number[]> = {}
  FEATURE_ORDER.forEach((key) => {
    crossMoodVals[key] = moodKeys.map((m) =>
      normalize(key, allMoods[m]?.avgFeatures?.[key] ?? 0)
    )
  })

  const means: Record<string, number> = {}
  const stds: Record<string, number> = {}
  FEATURE_ORDER.forEach((key) => {
    const vals = crossMoodVals[key]
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length)
    means[key] = mean
    stds[key] = std
  })

  const outliers: Outlier[] = []
  FEATURE_ORDER.forEach((key) => {
    const raw = activeMood.avgFeatures?.[key] ?? 0
    const norm = normalize(key, raw)
    const z = stds[key] > 0 ? (norm - means[key]) / stds[key] : 0
    if (Math.abs(z) < threshold) return

    const direction = z > 0 ? 'high' : 'low'
    const [highNarrative, lowNarrative] = FEATURE_NARRATIVES[key] ?? ['', '']
    outliers.push({
      feature: key,
      z,
      value: raw,
      direction,
      narrative: direction === 'high' ? highNarrative : lowNarrative,
    })
  })

  return outliers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
}

// ── Radar helpers ─────────────────────────────────────────────────────────────
function radarPoint(angle: number, r: number, cx: number, cy: number) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) }
}

function radarPath(values: number[], R: number, cx: number, cy: number) {
  const n = values.length
  return (
    values.map((v, i) => {
      const angle = (2 * Math.PI * i) / n
      const p = radarPoint(angle, v * R, cx, cy)
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`
    }).join(' ') + ' Z'
  )
}

// ── RadarChart ────────────────────────────────────────────────────────────────
function RadarChart({
  activeMood, allMoods, selectedMood, moodColor,
  onTooltipEnter, onTooltipMove, onTooltipLeave,
}: {
  activeMood: MoodProfile
  allMoods: MoodProfiles
  selectedMood: string
  moodColor: string
  onTooltipEnter: (text: string) => (e: React.MouseEvent<HTMLElement | SVGElement>) => void
  onTooltipMove: (e: React.MouseEvent<HTMLElement | SVGElement>) => void
  onTooltipLeave: () => void
}) {
  const SIZE = 300
  const CX = SIZE / 2, CY = SIZE / 2, R = 105
  const N = FEATURE_ORDER.length
  const rings = [0.25, 0.5, 0.75, 1.0]

  const normalize = (key: string, val: number) =>
    FEATURE_META[key]?.isRaw ? Math.min(1, val / (FEATURE_META[key].rawMax ?? 200)) : Math.max(0, Math.min(1, val))

  const activeValues = FEATURE_ORDER.map((f) => normalize(f, activeMood.avgFeatures?.[f] ?? 0))

  const moodKeys = Object.keys(allMoods)
  const totalPlaylists = moodKeys.reduce((s, k) => s + (allMoods[k]?.playlists ?? 0), 0)
  const refValues = FEATURE_ORDER.map((f) => {
    const weighted = moodKeys.reduce((s, k) => {
      return s + normalize(f, allMoods[k]?.avgFeatures?.[f] ?? 0) * (allMoods[k]?.playlists ?? 0)
    }, 0)
    return totalPlaylists > 0 ? weighted / totalPlaylists : 0
  })

  const showRef = selectedMood !== 'all'

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mood-svg radar-svg" role="img" aria-label="Audio feature radar chart">
      {rings.map((r) => (
        <polygon key={r} className="radar-ring"
          points={FEATURE_ORDER.map((_, i) => {
            const p = radarPoint((2 * Math.PI * i) / N, r * R, CX, CY)
            return `${p.x},${p.y}`
          }).join(' ')}
        />
      ))}
      {FEATURE_ORDER.map((feat, i) => {
        const angle = (2 * Math.PI * i) / N
        const outer = radarPoint(angle, R, CX, CY)
        const labelPt = radarPoint(angle, R + 22, CX, CY)
        const anchor = Math.abs(outer.x - CX) < 5 ? 'middle' : outer.x < CX ? 'end' : 'start'
        return (
          <g key={feat}>
            <line x1={CX} y1={CY} x2={outer.x} y2={outer.y} className="radar-spoke" />
            <text x={labelPt.x} y={labelPt.y} textAnchor={anchor} dominantBaseline="middle" className="radar-label">
              {FEATURE_META[feat]?.label ?? feat}
            </text>
          </g>
        )
      })}
      {showRef && <path d={radarPath(refValues, R, CX, CY)} className="radar-ref-polygon" />}
      <path d={radarPath(activeValues, R, CX, CY)} className="radar-active-polygon"
        style={{ fill: `${moodColor}33`, stroke: moodColor }} />
      {FEATURE_ORDER.map((feat, i) => {
        const angle = (2 * Math.PI * i) / N
        const p = radarPoint(angle, activeValues[i] * R, CX, CY)
        const raw = activeMood.avgFeatures?.[feat] ?? 0
        const fm = FEATURE_META[feat]
        const displayVal = fm?.isRaw ? `${Math.round(raw)} BPM` : raw.toFixed(2)
        return (
          <circle key={feat} cx={p.x} cy={p.y} r={5} style={{ fill: moodColor }}
            className="radar-dot"
            onMouseEnter={onTooltipEnter(`${fm?.label ?? feat}: ${displayVal} — ${fm?.description ?? ''}`)}
            onMouseMove={onTooltipMove}
            onMouseLeave={onTooltipLeave}
          />
        )
      })}
      {showRef && (
        <g>
          <line x1={8} y1={SIZE - 30} x2={18} y2={SIZE - 30} className="radar-ref-legend-line" />
          <text x={23} y={SIZE - 30} dominantBaseline="middle" className="radar-legend-text">avg all moods</text>
          <rect x={8} y={SIZE - 18} width={10} height={10} rx={2}
            style={{ fill: `${moodColor}33`, stroke: moodColor, strokeWidth: 1.5 }} />
          <text x={23} y={SIZE - 13} dominantBaseline="middle" className="radar-legend-text">
            {MOOD_META[selectedMood]?.label ?? selectedMood}
          </text>
        </g>
      )}
    </svg>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
type MoodProfileVizProps = TooltipHandlers & {
  activeMood: MoodProfile | null
  moodProfiles: MoodProfiles | null
  selectedMood: string
  isInView: boolean
}

// ── Main component ────────────────────────────────────────────────────────────
export function MoodProfileViz({
  activeMood, moodProfiles, selectedMood, isInView,
  onTooltipEnter, onTooltipMove, onTooltipLeave,
}: MoodProfileVizProps) {
  const meta = MOOD_META[selectedMood]
  const moodColor = meta?.color ?? '#0f4c81'
  const artistsRef = useRef<SVGSVGElement>(null)

  const artists = useMemo(() => (activeMood?.topArtists ?? []).slice(0, 10), [activeMood])
  const artistMax = useMemo(() => d3.max(artists, (d) => d.count) ?? 1, [artists])

  const outliers = useMemo(() => {
    if (!activeMood || !moodProfiles) return []
    return computeOutliers(activeMood, moodProfiles)
  }, [activeMood, moodProfiles, selectedMood])

  const topOutliers = outliers.slice(0, 2)

  // Build the narrative lede
  const narrativeLede = useMemo(() => {
    if (selectedMood in BLAND_NARRATIVES) return BLAND_NARRATIVES[selectedMood]
    if (topOutliers.length === 0) return BLAND_NARRATIVES['all'] ?? ''
    if (topOutliers.length === 1) return topOutliers[0].narrative
    // Two outliers — join naturally
    const [a, b] = topOutliers
    const aWord = a.direction === 'high' ? FEATURE_META[a.feature]?.highWord : FEATURE_META[a.feature]?.lowWord
    const bWord = b.direction === 'high' ? FEATURE_META[b.feature]?.highWord : FEATURE_META[b.feature]?.lowWord
    return `${a.narrative} It's also notably ${bWord ?? b.feature} compared to other moods — the combination of ${aWord ?? a.feature} and ${bWord ?? b.feature} is what gives ${meta?.label ?? selectedMood} its character.`
  }, [topOutliers, selectedMood])

  useEffect(() => {
    if (!artistsRef.current) return
    const bars = d3.select(artistsRef.current).selectAll<SVGRectElement, unknown>('.artist-bar')
    bars.interrupt().attr('width', 0)
    if (!isInView) return
    bars.transition().duration(700).delay((_, i) => i * 50).ease(d3.easeCubicOut)
      .attr('width', function () { return Number((this as SVGRectElement).dataset.width ?? 0) })
  }, [artists, isInView, selectedMood])

  if (!activeMood || !moodProfiles) return null

  const LABEL_X = 12
  const BAR_X = 165
  const BAR_W = 360
  const ARTIST_ROW_H = 36
  const ARTIST_SVG_H = 12 + artists.length * ARTIST_ROW_H + 20

  const examples = [...new Set(activeMood.examples ?? [])].slice(0, 6)

  return (
    <div className="mood-profile-root">

      {/* ── Mood header ── */}
      <div className="mood-header">
        <span className="mood-header-emoji">{meta?.emoji ?? '🎵'}</span>
        <div>
          <h4 className="mood-header-title" style={{ color: moodColor }}>
            {meta?.label ?? selectedMood.replace('_', ' ')}
          </h4>
          <span className="mood-header-count">
            {activeMood.playlists.toLocaleString()} playlists
          </span>
        </div>
      </div>

      {/* ── Narrative lede ── */}
      <div className="mood-lede">
        <p className="mood-lede-text">{narrativeLede}</p>

        {/* Outlier stat chips */}
        {topOutliers.length > 0 && (
          <div className="mood-outlier-chips">
            {outliers.map((o) => {
              const fm = FEATURE_META[o.feature]
              const displayVal = fm?.isRaw ? `${Math.round(o.value)} BPM` : o.value.toFixed(2)
              const sign = o.direction === 'high' ? '+' : '−'
              return (
                <span
                  key={o.feature}
                  className="mood-outlier-chip"
                  style={{ borderColor: `${moodColor}55`, color: moodColor }}
                  onMouseEnter={onTooltipEnter(`${fm?.label}: ${displayVal} (${sign}${Math.abs(o.z).toFixed(1)}σ from average) — ${fm?.description}`)}
                  onMouseMove={onTooltipMove}
                  onMouseLeave={onTooltipLeave}
                >
                  {sign}{Math.abs(o.z).toFixed(1)}σ {fm?.label}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Radar + Artists ── */}
      <div className="mood-charts-grid">

        <div className="mood-chart-panel mood-chart-panel--radar">
          <p className="mood-panel-title">Audio Feature Fingerprint</p>
          <RadarChart
            activeMood={activeMood} allMoods={moodProfiles}
            selectedMood={selectedMood} moodColor={moodColor}
            onTooltipEnter={onTooltipEnter} onTooltipMove={onTooltipMove} onTooltipLeave={onTooltipLeave}
          />
          <p className="mood-footnote">Hover dots for values · Dashed = all-moods average</p>
        </div>

        <div className="mood-chart-panel">
          <p className="mood-panel-title">Artists That Define This Mood</p>
          <svg ref={artistsRef} viewBox={`0 0 560 ${ARTIST_SVG_H}`} className="mood-svg"
            role="img" aria-label="Top artists bar chart">
            {artists.map((artist, i) => {
              const y = 12 + i * ARTIST_ROW_H
              const barW = (artist.count / artistMax) * BAR_W
              const pct = Math.round((artist.count / artistMax) * 100)
              return (
                <g key={artist.name}
                  onMouseEnter={onTooltipEnter(`${artist.name}: ${artist.count.toLocaleString()} playlist appearances`)}
                  onMouseMove={onTooltipMove} onMouseLeave={onTooltipLeave}>
                  <rect x={BAR_X} y={y + 6} width={BAR_W} height={14} rx={7} className="bar-track" />
                  <rect className="artist-bar" x={BAR_X} y={y + 6} width={0} height={14} rx={7}
                    data-width={barW} style={{ fill: moodColor }} />
                  <text x={LABEL_X} y={y + 17} className="bar-label">{i + 1}. {artist.name}</text>
                  <text x={BAR_X + BAR_W + 8} y={y + 17} className="bar-value">{pct}%</text>
                </g>
              )
            })}
            {[0, 25, 50, 75, 100].map((pct) => {
              const x = BAR_X + (pct / 100) * BAR_W
              return (
                <g key={pct}>
                  <line x1={x} y1={ARTIST_SVG_H - 12} x2={x} y2={ARTIST_SVG_H - 6} className="axis-tick" />
                  <text x={x} y={ARTIST_SVG_H - 1} className="axis-tick-label" textAnchor="middle">{pct}%</text>
                </g>
              )
            })}
          </svg>
          <p className="mood-footnote">% relative to top artist in this mood</p>
        </div>

      </div>

      {/* ── Playlist titles as texture ── */}
      {examples.length > 0 && (
        <div className="mood-examples">
          <span className="mood-examples-label">Real playlists in this mood:</span>
          {examples.map((ex, i) => (
            <span key={i} className="mood-example-tag"
              style={{ borderColor: `${moodColor}44`, color: moodColor }}>
              {ex}
            </span>
          ))}
        </div>
      )}

    </div>
  )
}
