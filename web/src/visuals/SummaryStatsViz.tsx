import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { MoodProfiles, SummaryHistograms, TooltipHandlers } from './types'

type Props = {
  moodProfiles: MoodProfiles
  summaryHistograms: SummaryHistograms
  isInView: boolean
  hasAnimated: boolean
} & TooltipHandlers

export function SummaryStatsViz({ moodProfiles, summaryHistograms, isInView, hasAnimated, onTooltipEnter, onTooltipMove, onTooltipLeave }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hasBarsAnimatedRef = useRef(false)

  const artistCounts = new Map<string, number>()
  const trackCounts = new Map<string, number>()

  Object.values(moodProfiles).forEach((profile) => {
    profile.topArtists.forEach((artist) => {
      artistCounts.set(artist.name, (artistCounts.get(artist.name) ?? 0) + artist.count)
    })
    profile.topTracks.forEach((track) => {
      trackCounts.set(track.name, (trackCounts.get(track.name) ?? 0) + track.count)
    })
  })

  const topArtists = [...artistCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const topTracks = [...trackCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  if (topArtists.length === 0 || topTracks.length === 0) return null

  const maxArtistCount = topArtists[0]?.count ?? 1
  const maxTrackCount = topTracks[0]?.count ?? 1

  useEffect(() => {
    if (!rootRef.current || hasBarsAnimatedRef.current) {
      return
    }

    if (!isInView) {
      return
    }

    const bars = d3.select(rootRef.current).selectAll<HTMLElement, unknown>('.summary-bar-fill')

    bars
      .interrupt()
      .style('width', '0%')
      .transition()
      .duration(1700)
      .delay((_, idx) => idx * 70)
      .ease(d3.easeCubicOut)
      .style('width', function () {
        return (this as HTMLElement).dataset.targetWidth ?? '0%'
      })
    hasBarsAnimatedRef.current = true
  }, [isInView])

  return (
    <div className="summary-viz-root" ref={rootRef}>
      <div className="summary-kpi-grid">
        <article className={`summary-kpi-card ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '80ms' : '0ms' }}>
          <h4>Unique Artists (in top sets)</h4>
          <p>{artistCounts.size.toLocaleString()}</p>
        </article>

        <article className={`summary-kpi-card ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '220ms' : '0ms' }}>
          <h4>Top Artist</h4>
          <p>{topArtists[0]?.name ?? 'n/a'}</p>
        </article>

        <article className={`summary-kpi-card ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '360ms' : '0ms' }}>
          <h4>Top Song</h4>
          <p>{topTracks[0]?.name ?? 'n/a'}</p>
        </article>
      </div>

      <div className="summary-bars-grid">
        <section className={`summary-bars-panel ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '500ms' : '0ms' }}>
          <h4>Top Artists in Playlists</h4>
          <ul className="summary-bars-list">
            {topArtists.map((row) => {
              const width = (row.count / maxArtistCount) * 100
              return (
                <li key={`artist-${row.name}`} className="summary-bar-item">
                  <div className="summary-bar-meta">
                    <span>{row.name}</span>
                    <span>{row.count.toLocaleString()}</span>
                  </div>
                  <div className="summary-bar-track">
                    <div className="summary-bar-fill summary-bar-fill-count" data-target-width={`${width}%`} style={{ width: '0%' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={`summary-bars-panel ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '620ms' : '0ms' }}>
          <h4>Top Songs in Playlists</h4>
          <ul className="summary-bars-list">
            {topTracks.map((row) => {
              const width = (row.count / maxTrackCount) * 100
              return (
                <li key={`song-${row.name}`} className="summary-bar-item">
                  <div className="summary-bar-meta">
                    <span>{row.name}</span>
                    <span>{row.count.toLocaleString()}</span>
                  </div>
                  <div className="summary-bar-track">
                    <div className="summary-bar-fill summary-bar-fill-share" data-target-width={`${width}%`} style={{ width: '0%' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <div className="summary-histograms-grid">
        <section className={`summary-histogram-panel ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '740ms' : '0ms' }}>
          <h4>{summaryHistograms.artistCountHistogram.label}</h4>
          {(() => {
            const maxCount = Math.max(...summaryHistograms.artistCountHistogram.buckets.map((b) => b.count))
            return (
              <div className="histogram-wrapper">
                <div className="histogram-container">
                  {summaryHistograms.artistCountHistogram.buckets.map((bucket) => {
                    const barHeight = (bucket.count / maxCount) * 100
                    const tooltipText = `${bucket.bucketLabel}: ${bucket.count.toLocaleString()} playlists`
                    return (
                      <div key={`artist-${bucket.bucketLabel}`} className="histogram-bar-wrapper">
                        <div
                          className="histogram-bar-fill"
                          style={{ height: `${barHeight}%` }}
                          onMouseEnter={onTooltipEnter(tooltipText)}
                          onMouseMove={onTooltipMove}
                          onMouseLeave={onTooltipLeave}
                        />
                        <span className="histogram-bar-label">{bucket.bucketLabel}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          <div className="histogram-stats">
            <span>Median: {summaryHistograms.artistCountHistogram.stats.median}</span>
            <span>Mean: {summaryHistograms.artistCountHistogram.stats.mean.toFixed(1)}</span>
          </div>
        </section>

        <section className={`summary-histogram-panel ${hasAnimated ? 'visible' : ''}`} style={{ transitionDelay: hasAnimated ? '860ms' : '0ms' }}>
          <h4>{summaryHistograms.trackCountHistogram.label}</h4>
          {(() => {
            const maxCount = Math.max(...summaryHistograms.trackCountHistogram.buckets.map((b) => b.count))
            return (
              <div className="histogram-wrapper">
                <div className="histogram-container">
                  {summaryHistograms.trackCountHistogram.buckets.map((bucket) => {
                    const barHeight = (bucket.count / maxCount) * 100
                    const tooltipText = `${bucket.bucketLabel}: ${bucket.count.toLocaleString()} playlists`
                    return (
                      <div key={`track-${bucket.bucketLabel}`} className="histogram-bar-wrapper">
                        <div
                          className="histogram-bar-fill"
                          style={{ height: `${barHeight}%` }}
                          onMouseEnter={onTooltipEnter(tooltipText)}
                          onMouseMove={onTooltipMove}
                          onMouseLeave={onTooltipLeave}
                        />
                        <span className="histogram-bar-label">{bucket.bucketLabel}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          <div className="histogram-stats">
            <span>Median: {summaryHistograms.trackCountHistogram.stats.median}</span>
            <span>Mean: {summaryHistograms.trackCountHistogram.stats.mean.toFixed(1)}</span>
          </div>
        </section>
      </div>

    </div>
  )
}