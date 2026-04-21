import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import type { FlowPoint, TooltipHandlers } from './types'

type FlowVizProps = TooltipHandlers & {
  activeFlow: FlowPoint[]
  moodLabel: string
  isInView: boolean
}

const FEATURE_COLORS: Record<'energy' | 'valence' | 'tempo', string> = {
  energy: '#1db954',
  valence: '#212121',
  tempo: '#535353',
}

export function FlowViz({ activeFlow, moodLabel, isInView, onTooltipEnter, onTooltipMove, onTooltipLeave }: FlowVizProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, Math.max(1, activeFlow.length - 1)]).range([70, 870]),
    [activeFlow.length],
  )
  const yScale = useMemo(() => d3.scaleLinear().domain([0, 1]).range([280, 20]), [])

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
    const features: Array<'energy' | 'valence' | 'tempo'> = ['energy', 'valence', 'tempo']
    return features
      .map((feature) => {
        const points = activeFlow
          .map((point, i) => {
            const raw = point[feature]
            if (raw === null || raw === undefined) {
              return null
            }
            const normalized = feature === 'tempo' ? Math.min(1, raw / 200) : Math.max(0, Math.min(1, raw))
            return [xScale(i), yScale(normalized)] as [number, number]
          })
          .filter((p): p is [number, number] => p !== null)

        if (points.length < 2) {
          return null
        }

        const d = line(points)
        if (!d) {
          return null
        }

        return {
          feature,
          d,
          color: FEATURE_COLORS[feature],
        }
      })
      .filter((item): item is { feature: 'energy' | 'valence' | 'tempo'; d: string; color: string } => item !== null)
  }, [activeFlow, line, xScale, yScale])

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
      .duration(1000)
      .ease(d3.easeCubicOut)
      .style('opacity', 0.85)
  }, [isInView, paths])

  return (
    <>
      <svg ref={svgRef} viewBox="0 0 900 350" className={`flow-svg ${isInView ? 'visible' : ''}`} role="img" aria-label="Playlist flow chart">
        <defs>
          <linearGradient id="grid-fade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#212121" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#212121" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="900" height="350" className="flow-bg" />
        <rect x="70" y="20" width="800" height="260" fill="url(#grid-fade)" />

        <line x1="70" y1="20" x2="70" y2="280" stroke="#535353" strokeWidth="2" />
        <line x1="70" y1="280" x2="870" y2="280" stroke="#535353" strokeWidth="2" />

        {[0, 0.25, 0.5, 0.75, 1].map((val) => {
          const y = yScale(val)
          return (
            <g key={`y-tick-${val}`}>
              <line x1="60" y1={y} x2="70" y2={y} stroke="#535353" strokeWidth="1.5" opacity="0.85" />
              <text x="55" y={y} textAnchor="end" dominantBaseline="middle" className="axis-label" fontSize="12" fill="#212121">
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
              <line x1={x} y1="280" x2={x} y2="292" stroke="#535353" strokeWidth="1.5" opacity="0.85" />
              <text x={x} y="308" textAnchor="middle" className="axis-label" fontSize="12" fill="#212121">
                {label}
              </text>
            </g>
          )
        })}

        <text x="20" y="150" textAnchor="middle" className="axis-title" fontSize="11" fontWeight="600" fill="#212121" transform="rotate(-90 20 150)">
          Feature Value (0-100)
        </text>
        <text x="470" y="330" textAnchor="middle" className="axis-title" fontSize="11" fontWeight="600" fill="#212121">
          Playlist Progress
        </text>

        {paths.map((path) => (
          <path
            key={path.feature}
            className="flow-line"
            d={path.d}
            fill="none"
            stroke={path.color}
            strokeWidth="3"
            opacity={isInView ? 0.85 : 0}
            onMouseEnter={onTooltipEnter(`${path.feature} trajectory for ${moodLabel}`)}
            onMouseMove={onTooltipMove}
            onMouseLeave={onTooltipLeave}
          />
        ))}
      </svg>
      <div className="flow-legend">
        <span className="flow-chip energy" onMouseEnter={onTooltipEnter('Higher means more intensity')} onMouseMove={onTooltipMove} onMouseLeave={onTooltipLeave}>
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
        <span className="flow-chip tempo" onMouseEnter={onTooltipEnter('Normalized BPM trend')} onMouseMove={onTooltipMove} onMouseLeave={onTooltipLeave}>
          Tempo (speed)
        </span>
      </div>
    </>
  )
}
