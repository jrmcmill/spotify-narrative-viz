import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { CLUSTER_COLORS } from './constants'
import type { TitleClusters, TooltipHandlers } from './types'

type TitleClustersVizProps = TooltipHandlers & {
  titleClusters: TitleClusters
  isInView: boolean
  isPointMoodMatch: (title: string) => boolean
}

export function TitleClustersViz({
  titleClusters,
  isInView,
  isPointMoodMatch,
  onTooltipEnter,
  onTooltipMove,
  onTooltipLeave,
}: TitleClustersVizProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const hasAnimatedRef = useRef(false)

  const bounds = useMemo(() => {
    if (titleClusters.points.length === 0) {
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

  const plottedPoints = useMemo(() => {
    if (!bounds) {
      return [] as Array<{ x: number; y: number; radius: number; moodHit: boolean; fill: string; label: string; id: string }>
    }

    const xScale = d3.scaleLinear().domain([bounds.minX, bounds.maxX]).range([40, 860])
    const yScale = d3.scaleLinear().domain([bounds.minY, bounds.maxY]).range([420, 40])

    return titleClusters.points.slice(0, 2200).map((point) => {
      const moodHit = isPointMoodMatch(point.title)
      return {
        id: `${point.title}-${point.cluster}`,
        x: xScale(point.x),
        y: yScale(point.y),
        radius: Math.min(7, 2 + Math.log10(point.count + 1)),
        moodHit,
        fill: CLUSTER_COLORS[point.cluster % CLUSTER_COLORS.length],
        label: `${point.title} (${point.count.toLocaleString()}) - ${moodHit ? 'matches selected mood' : 'outside selected mood emphasis'}`,
      }
    })
  }, [bounds, isPointMoodMatch, titleClusters])

  useEffect(() => {
    if (!svgRef.current) {
      return
    }

    if (!isInView || hasAnimatedRef.current) {
      return
    }

    const dots = d3.select(svgRef.current).selectAll<SVGCircleElement, unknown>('.cluster-point')
    dots
      .interrupt()
      .attr('r', 0)
      .transition()
      .duration(600)
      .delay((_, idx) => (idx % 40) * 12)
      .ease(d3.easeCubicOut)
      .attr('r', function () {
        return Number((this as SVGCircleElement).dataset.radius ?? 0)
      })
    hasAnimatedRef.current = true
  }, [isInView])

  if (!bounds) {
    return null
  }

  return (
    <>
      <svg ref={svgRef} viewBox="0 0 900 460" className="clusters-svg" role="img" aria-label="Playlist title clusters">
        <rect x="0" y="0" width="900" height="460" className="clusters-bg" />
        {plottedPoints.map((point) => (
          <circle
            key={point.id}
            className="cluster-point"
            cx={point.x}
            cy={point.y}
            r={isInView || hasAnimatedRef.current ? point.radius : 0}
            data-radius={point.radius}
            fill={point.fill}
            fillOpacity={point.moodHit ? 0.75 : 0.16}
            stroke={point.moodHit ? '#b3b3b3' : 'none'}
            strokeWidth={point.moodHit ? 0.5 : 0}
            onMouseEnter={onTooltipEnter(point.label)}
            onMouseMove={onTooltipMove}
            onMouseLeave={onTooltipLeave}
          />
        ))}
      </svg>
      <div className="cluster-legend">
        {titleClusters.clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="legend-item"
            onMouseEnter={onTooltipEnter(`${cluster.topTerms.join(', ')} | ${cluster.weight.toLocaleString()} playlists`)}
            onMouseMove={onTooltipMove}
            onMouseLeave={onTooltipLeave}
          >
            <span className="legend-color" style={{ backgroundColor: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length] }} />
            <div>
              <p>{cluster.label}</p>
              <small>{cluster.weight.toLocaleString()} titles</small>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
