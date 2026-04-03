import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import type { MoodProfile, TooltipHandlers } from './types'

type MoodProfileVizProps = TooltipHandlers & {
  activeMood: MoodProfile | null
  isInView: boolean
}

type ArtistRow = {
  name: string
  count: number
}

type FeatureRow = {
  key: string
  value: number
  normalized: number
}

export function MoodProfileViz({ activeMood, isInView, onTooltipEnter, onTooltipMove, onTooltipLeave }: MoodProfileVizProps) {
  const artistsRef = useRef<SVGSVGElement>(null)
  const featuresRef = useRef<SVGSVGElement>(null)

  const artists = useMemo(() => (activeMood?.topArtists ?? []).slice(0, 10), [activeMood])
  const features = useMemo(() => {
    return Object.entries(activeMood?.avgFeatures ?? {}).map(([key, value]) => ({
      key,
      value,
      normalized: key === 'tempo' ? Math.min(1, value / 200) : Math.max(0, Math.min(1, value)),
    }))
  }, [activeMood])

  const artistScale = useMemo(() => {
    const max = d3.max(artists, (d) => d.count) ?? 1
    return d3.scaleLinear().domain([0, max]).range([0, 420])
  }, [artists])

  useEffect(() => {
    const animateBars = (node: SVGSVGElement | null, selector: string) => {
      if (!node) {
        return
      }
      const bars = d3.select(node).selectAll<SVGRectElement, unknown>(selector)
      if (!isInView) {
        bars.interrupt().attr('width', 0)
        return
      }
      bars
        .interrupt()
        .attr('width', 0)
        .transition()
        .duration(800)
        .delay((_, idx) => idx * 40)
        .ease(d3.easeCubicOut)
        .attr('width', function () {
          return Number((this as SVGRectElement).dataset.width ?? 0)
        })
    }

    animateBars(artistsRef.current, '.artist-bar')
    animateBars(featuresRef.current, '.feature-bar')
  }, [artists, features, isInView])

  if (!activeMood) {
    return null
  }

  return (
    <div className="mood-grid">
      <div>
        <h3>Top Artists</h3>
        <svg ref={artistsRef} viewBox="0 0 600 410" className="mood-artists-svg" role="img" aria-label="Top artists by mood">
          <rect x="0" y="0" width="600" height="410" className="clusters-bg" />
          {(artists as ArtistRow[]).map((artist, idx) => {
            const y = 20 + idx * 38
            const width = artistScale(artist.count)
            return (
              <g
                key={artist.name}
                onMouseEnter={onTooltipEnter(`${artist.name}: ${artist.count.toLocaleString()} playlist appearances`)}
                onMouseMove={onTooltipMove}
                onMouseLeave={onTooltipLeave}
              >
                <text x="12" y={y + 12} className="axis-label" fontSize="12">
                  {artist.name}
                </text>
                <rect
                  className="artist-bar"
                  x="170"
                  y={y}
                  rx="4"
                  ry="4"
                  height="16"
                  width={isInView ? width : 0}
                  data-width={width}
                  fill="url(#artist-bar-gradient)"
                />
                <text x="170" y={y + 29} className="axis-label" fontSize="11">
                  {artist.count.toLocaleString()}
                </text>
              </g>
            )
          })}
          <defs>
            <linearGradient id="artist-bar-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0f4c81" />
              <stop offset="100%" stopColor="#177e89" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div>
        <h3>Average Audio Features</h3>
        <svg ref={featuresRef} viewBox="0 0 600 300" className="mood-features-svg" role="img" aria-label="Average audio features by mood">
          <rect x="0" y="0" width="600" height="300" className="clusters-bg" />
          {(features as FeatureRow[]).map((feature, idx) => {
            const y = 22 + idx * 34
            const width = feature.normalized * 420
            return (
              <g
                key={feature.key}
                onMouseEnter={onTooltipEnter(`${feature.key}: ${feature.value.toFixed(2)}`)}
                onMouseMove={onTooltipMove}
                onMouseLeave={onTooltipLeave}
              >
                <text x="12" y={y + 10} className="axis-label" fontSize="12">
                  {feature.key}
                </text>
                <rect x="170" y={y} width="420" height="14" rx="7" fill="#edf2f7" />
                <rect
                  className="feature-bar"
                  x="170"
                  y={y}
                  width={isInView ? width : 0}
                  data-width={width}
                  height="14"
                  rx="7"
                  fill="url(#feature-bar-gradient)"
                />
                <text x="170" y={y + 28} className="axis-label" fontSize="11">
                  {feature.value.toFixed(2)}
                </text>
              </g>
            )
          })}
          <defs>
            <linearGradient id="feature-bar-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f28c28" />
              <stop offset="100%" stopColor="#d9643a" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  )
}
