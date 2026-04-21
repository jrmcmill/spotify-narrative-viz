import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { ALL_MOOD_OPTION } from './constants'
import type { ConsensusRow, MoodProfiles, TooltipHandlers } from './types'

type ConsensusVizProps = TooltipHandlers & {
  consensus: ConsensusRow[]
  moodProfiles: MoodProfiles
  selectedMood: string
  isInView: boolean
}

type EnrichedRow = ConsensusRow & {
  uniquePerPlaylist: number
}

type FocusModel = {
  rows: EnrichedRow[]
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    medianX: number
    medianY: number
  }
}

type SelectedFocus = {
  selected: EnrichedRow
  shareRank: number
  chaosRank: number
  total: number
}

const MOOD_INTERPRETATIONS: Record<string, string> = {
  sad: 'Sad sits firmly in the high-consensus, lower-diversity region, indicating one of the clearest shared definitions across listeners. Even across thousands of playlists, users tend to return to a familiar set of emotionally resonant songs. While there is still some variation, the overall structure suggests a widely recognized "sound" of sadness that many people agree on.',
  hype:
    'Hype shows strong consensus paired with relatively low diversity, placing it in the cohesive mainstream region. This suggests that high-energy, motivating playlists often rely on a shared set of recognizable tracks. Compared to other moods, hype feels more standardized: listeners are not just chasing a feeling, but often the same songs that reliably create it.',
  romance:
    'Romance falls closer to the middle, with moderate consensus and moderate diversity. While there is some shared understanding of what fits this mood, playlists still branch out beyond the most common songs. This balance suggests that romance is partly shaped by cultural norms, but also leaves room for personal interpretation and variation.',
  road_trip:
    'Road trip leans toward lower consensus, with playlists that are relatively diverse beyond their most popular tracks. While there are some common staples, the mood is less tightly defined, allowing for a wide range of genres and personal preferences. This reflects how road trips are experienced differently by each listener, making the category more flexible and exploratory.',
  sleep:
    'Sleep shows low consensus but higher diversity, indicating that while users may agree on the general purpose of the playlist, they differ widely in execution. Instead of relying on a shared set of songs, listeners branch out into many different tracks, suggesting that what helps someone relax or fall asleep is highly individualized.',
  study:
    'Study stands out as one of the most diverse and least consensus-driven moods. With low concentration around top tracks and high diversity across playlists, there is little agreement on a core set of songs. This suggests that study music is deeply personal: listeners prioritize different sounds, whether instrumental, ambient, or familiar favorites, depending on what helps them focus.',
  workout:
    'Workout sits slightly below the midpoint in consensus with relatively lower diversity, suggesting a mix of shared expectations and individual variation. While there are recognizable high-energy tracks that many users include, playlists still incorporate a range of different songs. This places workout between structure and flexibility, shaped by both common patterns and personal motivation styles.',
}

const formatCategoryLabel = (category: string) => category.replace('_', ' ')

const describeConsensusPosition = (focus: FocusModel & SelectedFocus) => {
  const consensusTier = focus.shareRank <= 2 ? 'one of the clearest shared definitions' : 'less consensus around the same core songs'
  const chaosTier =
    focus.chaosRank <= 2
      ? 'and listeners branch into a wider range of supporting tracks'
      : 'and playlists stay relatively concentrated beyond the biggest staples'
  return `${formatCategoryLabel(focus.selected.category)} shows ${consensusTier}, ${chaosTier}.`
}

export function ConsensusViz({
  consensus,
  moodProfiles,
  selectedMood,
  isInView,
  onTooltipEnter,
  onTooltipMove,
  onTooltipLeave,
}: ConsensusVizProps) {
  const listRef = useRef<HTMLUListElement>(null)

  const consensusRows = useMemo(() => {
    return [...consensus]
      .map((row) => ({
        ...row,
        uniquePerPlaylist: row.playlists > 0 ? row.uniqueTracks / row.playlists : 0,
      }))
      .sort((a, b) => b.top50AvgShare - a.top50AvgShare)
  }, [consensus])

  const comparison = useMemo<FocusModel | null>(() => {
    if (consensusRows.length === 0) {
      return null
    }
    const xValues = consensusRows.map((row) => row.top50AvgShare)
    const yValues = consensusRows.map((row) => row.uniquePerPlaylist)

    return {
      rows: consensusRows,
      bounds: {
        minX: d3.min(xValues) ?? 0,
        maxX: d3.max(xValues) ?? 1,
        minY: d3.min(yValues) ?? 0,
        maxY: d3.max(yValues) ?? 1,
        medianX: d3.median(xValues) ?? 0,
        medianY: d3.median(yValues) ?? 0,
      },
    }
  }, [consensusRows])

  const focus = useMemo<SelectedFocus | null>(() => {
    if (selectedMood === ALL_MOOD_OPTION) {
      return null
    }

    const selected = consensusRows.find((row) => row.category === selectedMood)
    if (!selected) {
      return null
    }

    const topShareSorted = [...consensusRows].sort((a, b) => b.top50AvgShare - a.top50AvgShare)
    const chaosSorted = [...consensusRows].sort((a, b) => b.uniquePerPlaylist - a.uniquePerPlaylist)
    const shareRank = topShareSorted.findIndex((row) => row.category === selectedMood) + 1
    const chaosRank = chaosSorted.findIndex((row) => row.category === selectedMood) + 1

    return {
      selected,
      shareRank,
      chaosRank,
      total: consensusRows.length,
    }
  }, [consensusRows, selectedMood])

  useEffect(() => {
    if (!listRef.current) {
      return
    }

    const bars = d3.select(listRef.current).selectAll<HTMLElement, unknown>('.consensus-fill')
    if (!isInView) {
      bars.interrupt().style('width', '0%')
      return
    }

    bars
      .interrupt()
      .style('width', '0%')
      .transition()
      .duration(900)
      .delay((_, idx) => idx * 45)
      .ease(d3.easeCubicOut)
      .style('width', function () {
        return (this as HTMLElement).dataset.targetWidth ?? '0%'
      })
  }, [consensusRows, isInView])

  const focusDetails = focus ? moodProfiles[focus.selected.category] : null
  const topTracks = (focusDetails?.topTracks ?? []).slice(0, 3)
  const examplePlaylists = Array.from(new Set((focusDetails?.examples ?? []).filter(Boolean))).slice(0, 3)

  return (
    <>
      {selectedMood === ALL_MOOD_OPTION ? (
        <div className="consensus-intro">
          <p>The global mood filter is set to all moods, so this view compares every category at once.</p>
        </div>
      ) : null}

      <ul className="consensus-list" ref={listRef}>
        {consensusRows.map((row, idx) => {
          const width = Math.max(2, row.top50AvgShare * 1000)
          const isSelected = row.category === selectedMood
          return (
            <li
              key={row.category}
              className={`consensus-item ${isSelected ? 'consensus-item-selected' : ''}`}
              style={{ animationDelay: `${isInView ? idx * 50 : 0}ms` }}
              onMouseEnter={onTooltipEnter(
                `${formatCategoryLabel(row.category)}: ${(row.top50AvgShare * 100).toFixed(2)}% avg top-50 share, ${row.uniqueTracks.toLocaleString()} unique tracks`,
              )}
              onMouseMove={onTooltipMove}
              onMouseLeave={onTooltipLeave}
            >
              <div className="consensus-meta">
                <span>{formatCategoryLabel(row.category)}</span>
                <small>
                  {row.playlists.toLocaleString()} playlists • {row.uniqueTracks.toLocaleString()} unique tracks
                </small>
              </div>
              <div className="consensus-track">
                <div className="consensus-fill" data-target-width={`${Math.min(width, 100)}%`} />
              </div>
              <strong>{(row.top50AvgShare * 100).toFixed(2)}%</strong>
            </li>
          )
        })}
      </ul>

      {comparison ? (
        <div className="consensus-focus-panel">
          <div className="consensus-focus-header">
            <div>
              <h3>Mood Position Map</h3>
              <p>Each point compares a mood on the same two axes: top-track consensus and playlist diversity.</p>
            </div>
            <p className="consensus-focus-summary">
              {focus ? describeConsensusPosition({ ...comparison, ...focus }) : 'Use the global mood filter to focus one category and reveal its representative songs and playlist examples.'}
            </p>
          </div>

          {focus ? (
            <div className="consensus-focus-metrics">
              <article>
                <span>Top-50 share</span>
                <strong>{(focus.selected.top50AvgShare * 100).toFixed(2)}%</strong>
              </article>
              <article>
                <span>Unique tracks per playlist</span>
                <strong>{focus.selected.uniquePerPlaylist.toFixed(2)}</strong>
              </article>
              <article>
                <span>Playlists matched</span>
                <strong>{focus.selected.playlists.toLocaleString()}</strong>
              </article>
            </div>
          ) : null}

          <ConsensusScatter
            focus={comparison}
            selectedMood={selectedMood}
            onTooltipEnter={onTooltipEnter}
            onTooltipMove={onTooltipMove}
            onTooltipLeave={onTooltipLeave}
          />

          <div className="consensus-reading-panel">
            <p className="consensus-reading-lede">
              The map brings these patterns together by placing each mood along two dimensions: how strongly playlists
              agree on a shared set of songs, and how diverse those playlists remain beyond their most popular tracks.
              Moods on the right show stronger consensus, where many users return to the same core songs, while those
              on the left are more fragmented and open-ended. Moving upward, playlists draw from a wider range of
              tracks, reflecting greater diversity in how the mood is interpreted. Together, this view reveals that
              moods are not just categories, they vary in how tightly or loosely they are collectively defined.
            </p>

            {selectedMood !== ALL_MOOD_OPTION && MOOD_INTERPRETATIONS[selectedMood] ? (
              <div className="consensus-reading-detail">
                <span className="consensus-reading-chip">{formatCategoryLabel(selectedMood)}</span>
                <p>{MOOD_INTERPRETATIONS[selectedMood]}</p>
              </div>
            ) : null}
          </div>

          {focusDetails ? (
            <div className="consensus-story-grid">
              <article className="consensus-detail-card">
                <h4>Representative Songs</h4>
                <p>
                  These are the most repeated tracks inside playlists labeled{' '}
                  {formatCategoryLabel(focus?.selected.category ?? selectedMood)}.
                </p>
                <ul className="consensus-detail-list">
                  {topTracks.length > 0 ? (
                    topTracks.map((track) => (
                      <li key={track.name}>
                        <span className="consensus-track-text">
                          <span>{track.name}</span>
                          {track.artist ? <small>{track.artist}</small> : null}
                        </span>
                        <strong>{track.count.toLocaleString()} adds</strong>
                      </li>
                    ))
                  ) : (
                    <li>
                      <span>No representative tracks were available for this mood.</span>
                    </li>
                  )}
                </ul>
              </article>

              <article className="consensus-detail-card">
                <h4>Playlist Name Examples</h4>
                <p>Example playlist titles show the social context people attach to this mood.</p>
                <ul className="consensus-example-list">
                  {examplePlaylists.length > 0 ? (
                    examplePlaylists.map((example) => <li key={example}>{example}</li>)
                  ) : (
                    <li>No example playlist titles were available for this mood.</li>
                  )}
                </ul>
              </article>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

type ScatterProps = TooltipHandlers & {
  focus: FocusModel
  selectedMood: string
}

function ConsensusScatter({ focus, selectedMood, onTooltipEnter, onTooltipMove, onTooltipLeave }: ScatterProps) {
  const xScale = d3.scaleLinear().domain([focus.bounds.minX, focus.bounds.maxX]).nice().range([96, 860])
  const yScale = d3.scaleLinear().domain([focus.bounds.minY, focus.bounds.maxY]).nice().range([240, 40])

  return (
    <svg viewBox="0 0 900 310" className="consensus-scatter" role="img" aria-label="Consensus versus diversity position map">
      <rect x="0" y="0" width="900" height="310" className="flow-bg" />
      <line x1="96" y1="240" x2="860" y2="240" stroke="#cbd5e0" strokeWidth="1.5" />
      <line x1="96" y1="40" x2="96" y2="240" stroke="#cbd5e0" strokeWidth="1.5" />

      <line
        x1={xScale(focus.bounds.medianX)}
        y1="40"
        x2={xScale(focus.bounds.medianX)}
        y2="240"
        stroke="#9fb3c8"
        strokeDasharray="6 5"
        opacity="0.8"
      />
      <line
        x1="96"
        y1={yScale(focus.bounds.medianY)}
        x2="860"
        y2={yScale(focus.bounds.medianY)}
        stroke="#9fb3c8"
        strokeDasharray="6 5"
        opacity="0.8"
      />

      <text x="112" y="68" className="consensus-quadrant-label">
        Fragmented and Expansive
      </text>
      <text x="840" y="68" textAnchor="end" className="consensus-quadrant-label">
        Shared but Diverse
      </text>
      <text x="112" y="224" className="consensus-quadrant-label">
        Personal and Focused
      </text>
      <text x="840" y="232" textAnchor="end" className="consensus-quadrant-label">
        Cohesive Mainstream
      </text>

      {focus.rows.map((row) => {
        const x = xScale(row.top50AvgShare)
        const y = yScale(row.uniquePerPlaylist)
        const selected = row.category === selectedMood
        const selectedLabelX = x > 690 ? x - 14 : x + 10
        const selectedLabelAnchor = x > 690 ? 'end' : 'start'
        const selectedLabelY = y > 195 ? y - 16 : y - 8
        return (
          <g key={row.category}>
            <circle
              cx={x}
              cy={y}
              r={selected ? 8 : 5.5}
              fill={selected ? '#f28c28' : '#6b7c93'}
              stroke={selected ? '#8a3b12' : '#ffffff'}
              strokeWidth={selected ? 2 : 1.2}
              opacity={selected ? 1 : 0.72}
              onMouseEnter={onTooltipEnter(
                `${formatCategoryLabel(row.category)}: consensus ${(row.top50AvgShare * 100).toFixed(2)}%, diversity pressure ${row.uniquePerPlaylist.toFixed(2)} unique tracks/playlist`,
              )}
              onMouseMove={onTooltipMove}
              onMouseLeave={onTooltipLeave}
            />
            {selected ? (
              <text x={selectedLabelX} y={selectedLabelY} textAnchor={selectedLabelAnchor} className="consensus-selected-label">
                {formatCategoryLabel(row.category)}
              </text>
            ) : null}
          </g>
        )
      })}

      <text x="470" y="275" className="axis-title" textAnchor="middle">
        Consensus Strength (Top-50 Avg Share)
      </text>
      <text x="40" y="145" className="axis-title" textAnchor="middle" transform="rotate(-90 40 145)">
        <tspan x="40" dy="-0.35em">
          Diversity Pressure
        </tspan>
        <tspan x="40" dy="0.95em">
          (Unique Tracks / Playlist)
        </tspan>
      </text>
      <text x="850" y="262" className="consensus-guide-label" textAnchor="end">
        Dashed lines mark the median across moods
      </text>
    </svg>
  )
}
