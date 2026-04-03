import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import type { ConsensusRow, TooltipHandlers } from './types'

type ConsensusVizProps = TooltipHandlers & {
  consensus: ConsensusRow[]
  selectedMood: string
  isInView: boolean
}

type EnrichedRow = ConsensusRow & {
  uniquePerPlaylist: number
}

type FocusModel = {
  rows: EnrichedRow[]
  selected: EnrichedRow
  shareRank: number
  chaosRank: number
  total: number
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    medianX: number
    medianY: number
  }
}

export function ConsensusViz({ consensus, selectedMood, isInView, onTooltipEnter, onTooltipMove, onTooltipLeave }: ConsensusVizProps) {
  const listRef = useRef<HTMLUListElement>(null)

  const consensusRows = useMemo(() => {
    if (selectedMood === 'all') {
      return consensus
    }
    return consensus.filter((row) => row.category === selectedMood)
  }, [consensus, selectedMood])

  const focus = useMemo<FocusModel | null>(() => {
    if (selectedMood === 'all') {
      return null
    }

    const enriched: EnrichedRow[] = consensus.map((row) => ({
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

    const xValues = enriched.map((row) => row.top50AvgShare)
    const yValues = enriched.map((row) => row.uniquePerPlaylist)

    return {
      rows: enriched,
      selected,
      shareRank,
      chaosRank,
      total: enriched.length,
      bounds: {
        minX: d3.min(xValues) ?? 0,
        maxX: d3.max(xValues) ?? 1,
        minY: d3.min(yValues) ?? 0,
        maxY: d3.max(yValues) ?? 1,
        medianX: d3.median(xValues) ?? selected.top50AvgShare,
        medianY: d3.median(yValues) ?? selected.uniquePerPlaylist,
      },
    }
  }, [consensus, selectedMood])

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

  return (
    <>
      <ul className="consensus-list" ref={listRef}>
        {consensusRows.map((row, idx) => {
          const width = Math.max(2, row.top50AvgShare * 1000)
          return (
            <li
              key={row.category}
              className={`consensus-item ${row.category === selectedMood ? 'consensus-item-selected' : ''}`}
              style={{ animationDelay: `${isInView ? idx * 50 : 0}ms` }}
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
                <div className="consensus-fill" data-target-width={`${Math.min(width, 100)}%`} />
              </div>
              <strong>{(row.top50AvgShare * 100).toFixed(2)}%</strong>
            </li>
          )
        })}
      </ul>

      {focus ? (
        <div className="consensus-focus-panel">
          <div className="consensus-focus-header">
            <h3>Mood Position Map</h3>
            <p>
              <strong>{focus.selected.category.replace('_', ' ')}</strong> ranks #{focus.shareRank}/{focus.total} on
              consensus strength and #{focus.chaosRank}/{focus.total} on diversity pressure.
            </p>
          </div>
          <ConsensusScatter
            focus={focus}
            selectedMood={selectedMood}
            onTooltipEnter={onTooltipEnter}
            onTooltipMove={onTooltipMove}
            onTooltipLeave={onTooltipLeave}
          />
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
  const xScale = d3.scaleLinear().domain([focus.bounds.minX, focus.bounds.maxX]).range([80, 860])
  const yScale = d3.scaleLinear().domain([focus.bounds.minY, focus.bounds.maxY]).range([240, 40])

  return (
    <svg viewBox="0 0 900 310" className="consensus-scatter" role="img" aria-label="Consensus versus diversity position map">
      <rect x="0" y="0" width="900" height="310" className="flow-bg" />
      <line x1="80" y1="240" x2="860" y2="240" stroke="#cbd5e0" strokeWidth="1.5" />
      <line x1="80" y1="40" x2="80" y2="240" stroke="#cbd5e0" strokeWidth="1.5" />

      <line x1={xScale(focus.bounds.medianX)} y1="40" x2={xScale(focus.bounds.medianX)} y2="240" stroke="#9fb3c8" strokeDasharray="6 5" opacity="0.8" />
      <line x1="80" y1={yScale(focus.bounds.medianY)} x2="860" y2={yScale(focus.bounds.medianY)} stroke="#9fb3c8" strokeDasharray="6 5" opacity="0.8" />

      <text x="96" y="56" className="consensus-quadrant-label">
        Shared but Diverse
      </text>
      <text x="648" y="56" className="consensus-quadrant-label">
        Strong Consensus
      </text>
      <text x="96" y="228" className="consensus-quadrant-label">
        Niche and Fragmented
      </text>
      <text x="648" y="228" className="consensus-quadrant-label">
        Cohesive Mainstream
      </text>

      {focus.rows.map((row) => {
        const x = xScale(row.top50AvgShare)
        const y = yScale(row.uniquePerPlaylist)
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
  )
}
