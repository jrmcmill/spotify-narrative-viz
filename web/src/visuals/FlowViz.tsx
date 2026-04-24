import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { FlowFeatureKey, FlowPoint, FlowSamplePlaylist, TooltipHandlers } from './types'

type FlowVizProps = TooltipHandlers & {
  activeFlowSamples: FlowSamplePlaylist[]
  moodLabel: string
  isInView: boolean
}

const FLOW_LINE_COLOR = '#212121'

const FEATURE_LABELS: Record<FlowFeatureKey, string> = {
  energy: 'Energy',
  valence: 'Valence',
  tempo: 'Tempo',
}

function describeSongExamples(sample: FlowSamplePlaylist): string {
  const songs = sample.exampleSongs.slice(0, 3)
  if (songs.length === 0) {
    return 'No song examples available.'
  }
  return songs.map((song) => `${song.name} - ${song.artist}`).join('\n')
}

function buildPathPoints(flow: FlowPoint[], feature: FlowFeatureKey, xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>) {
  return flow
    .map((point, i) => {
      const raw = point[feature]
      if (raw === null || raw === undefined) {
        return null
      }
      return [xScale(i), yScale(raw)] as [number, number]
    })
    .filter((p): p is [number, number] => p !== null)
}

function alignFeatureSeries(flow: FlowPoint[], feature: FlowFeatureKey, targetBins: number): number[] | null {
  if (targetBins < 2) {
    return null
  }

  const values = flow
    .map((point) => point[feature])
    .filter((value): value is number => value !== null && value !== undefined)

  if (values.length < 2) {
    return null
  }

  if (values.length === targetBins) {
    return values
  }

  // Resample onto a shared 0-100% progress axis so each playlist spans full start -> end.
  return Array.from({ length: targetBins }, (_, i) => {
    const sourcePos = (i / (targetBins - 1)) * (values.length - 1)
    const left = Math.floor(sourcePos)
    const right = Math.min(values.length - 1, left + 1)
    const mix = sourcePos - left
    return values[left] * (1 - mix) + values[right] * mix
  })
}

export function FlowViz({ activeFlowSamples, moodLabel, isInView, onTooltipEnter, onTooltipMove, onTooltipLeave }: FlowVizProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedFeature, setSelectedFeature] = useState<FlowFeatureKey>('energy')
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null)
  const features: FlowFeatureKey[] = ['energy', 'valence', 'tempo']
  const maxBins = Math.max(...activeFlowSamples.map((sample) => sample.flow.length), 0)

  const yDomain = useMemo<[number, number]>(() => {
    if (selectedFeature !== 'tempo') {
      return [0, 1]
    }
    const allValues = activeFlowSamples
      .flatMap((sample) => sample.flow)
      .map((point) => point.tempo)
      .filter((value): value is number => value !== null && value !== undefined)
    if (allValues.length === 0) {
      return [60, 180]
    }
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const span = Math.max(1, max - min)
    const pad = span * 0.1
    return [Math.max(40, min - pad), Math.min(220, max + pad)]
  }, [activeFlowSamples, selectedFeature])

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, Math.max(1, maxBins - 1)]).range([70, 870]),
    [maxBins],
  )
  const yScale = useMemo(() => d3.scaleLinear().domain(yDomain).range([280, 20]), [yDomain])

  const line = useMemo(
    () =>
      d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(d3.curveMonotoneX),
    [],
  )

  const paths = useMemo(() => {
    return activeFlowSamples
      .map((sample, idx) => {
        const aligned = alignFeatureSeries(sample.flow, selectedFeature, Math.max(2, maxBins))
        if (!aligned) {
          return null
        }

        const alignedFlow = aligned.map((value, i) => ({ bin: i, energy: value, valence: value, tempo: value }))
        const points = buildPathPoints(alignedFlow, 'energy', xScale, yScale)
        if (points.length < 2) {
          return null
        }

        const d = line(points)
        if (!d) {
          return null
        }

        return {
          id: `${sample.playlistName}-${idx}`,
          sample,
          d,
          stroke: FLOW_LINE_COLOR,
        }
      })
      .filter((item): item is { id: string; sample: FlowSamplePlaylist; d: string; stroke: string } => item !== null)
  }, [activeFlowSamples, line, maxBins, selectedFeature, xScale, yScale])

  const yTicks = useMemo(() => {
    if (selectedFeature === 'tempo') {
      return yScale.ticks(5)
    }
    return [0, 0.25, 0.5, 0.75, 1]
  }, [selectedFeature, yScale])

  useEffect(() => {
    if (!svgRef.current) {
      return
    }

    const lines = d3.select(svgRef.current).selectAll<SVGPathElement, unknown>('.flow-line')
    if (!isInView) {
      lines.interrupt().style('opacity', 0)
      return
    }

    lines
      .interrupt()
      .style('opacity', 0)
      .transition()
      .duration(2000)
      .ease(d3.easeCubicOut)
      .style('opacity', 0.7)
  }, [isInView, paths])

  const yTitle = selectedFeature === 'tempo' ? 'Tempo (BPM)' : `${FEATURE_LABELS[selectedFeature]} (0-100)`

  const lineTooltipText = (sample: FlowSamplePlaylist): string => {
    return [
      `${sample.playlistName}`,
      `Feature: ${FEATURE_LABELS[selectedFeature]}`,
      `Tracks: ${sample.trackCount} (${sample.tracksWithFeatures} with audio features)`,
      '',
      'Song examples from this playlist:',
      describeSongExamples(sample),
    ].join('\n')
  }

  return (
    <>
      <svg ref={svgRef} viewBox="0 0 900 350" className={`flow-svg ${isInView ? 'visible' : ''}`} role="img" aria-label="Playlist flow chart">
        <rect x="0" y="0" width="900" height="350" className="flow-bg" />

        <line x1="70" y1="20" x2="70" y2="280" stroke="#535353" strokeWidth="2" />
        <line x1="70" y1="280" x2="870" y2="280" stroke="#535353" strokeWidth="2" />

        {yTicks.map((val) => {
          const y = yScale(val)
          return (
            <g key={`y-tick-${val}`}>
              <line x1="60" y1={y} x2="70" y2={y} stroke="#535353" strokeWidth="1.5" opacity="0.85" />
              <text x="55" y={y} textAnchor="end" dominantBaseline="middle" className="axis-label" fontSize="12" fill="#212121">
                {selectedFeature === 'tempo' ? `${Math.round(val)}` : `${Math.round(val * 100)}`}
              </text>
            </g>
          )
        })}

        {[0, 0.5, 1].map((pos) => {
          const x = 70 + pos * 800
          const label = pos === 0 ? 'Start' : pos === 0.5 ? 'Middle' : 'End'
          return (
            <g key={`x-tick-${pos}`}>
              <line x1={x} y1="280" x2={x} y2="292" stroke="#535353" strokeWidth="1.5" opacity="0.85" />
              <text x={x} y="308" textAnchor="middle" className="axis-label" fontSize="12" fill="#212121">
                {label}
              </text>
            </g>
          )
        })}

        <text x="20" y="150" textAnchor="middle" className="axis-title" fontSize="11" fontWeight="600" fill="#212121" transform="rotate(-90 20 150)">
          {yTitle}
        </text>
        <text x="470" y="330" textAnchor="middle" className="axis-title" fontSize="11" fontWeight="600" fill="#212121">
          Playlist Position (start to end, normalized)
        </text>

        {paths.map((path) => (
          <g key={path.id}>
            <path
              className="flow-line"
              d={path.d}
              fill="none"
              stroke={hoveredPathId === path.id ? '#1db954' : path.stroke}
              strokeWidth={hoveredPathId === path.id ? '3.8' : '2.8'}
              opacity={isInView ? (hoveredPathId && hoveredPathId !== path.id ? 0.3 : 0.65) : 0}
              pointerEvents="none"
            />
            <path
              className="flow-hover-target"
              d={path.d}
              fill="none"
              stroke="#000"
              strokeWidth="16"
              opacity="0"
              pointerEvents="stroke"
              onMouseEnter={(event) => {
                setHoveredPathId(path.id)
                onTooltipEnter(lineTooltipText(path.sample))(event)
              }}
              onMouseMove={onTooltipMove}
              onMouseLeave={() => {
                setHoveredPathId(null)
                onTooltipLeave()
              }}
            />
          </g>
        ))}
      </svg>
      <div className="flow-feature-toggle" role="tablist" aria-label="Flow feature selector">
        {features.map((feature) => (
          <button
            key={feature}
            type="button"
            className={selectedFeature === feature ? 'flow-toggle-btn active' : 'flow-toggle-btn'}
            onClick={() => setSelectedFeature(feature)}
          >
            {FEATURE_LABELS[feature]}
          </button>
        ))}
      </div>
      <div className="flow-legend">
        <span
          className="flow-chip neutral"
          onMouseEnter={onTooltipEnter(`Showing up to 10 playlist trajectories for ${moodLabel}. Hover a line to inspect playlist and songs.`)}
          onMouseMove={onTooltipMove}
          onMouseLeave={onTooltipLeave}
        >
          10 playlist trajectories shown in #212121. Hover a line for playlist details.
        </span>
      </div>
    </>
  )
}
