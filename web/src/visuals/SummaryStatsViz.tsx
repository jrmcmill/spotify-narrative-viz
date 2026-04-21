import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { MoodProfiles } from './types'

type Props = {
  moodProfiles: MoodProfiles
  isInView: boolean
}

export function SummaryStatsViz({ moodProfiles, isInView }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

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
    if (!rootRef.current) {
      return
    }

    const bars = d3.select(rootRef.current).selectAll<HTMLElement, unknown>('.summary-bar-fill')

    if (!isInView) {
      bars.interrupt().style('width', '0%')
      return
    }

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
  }, [isInView, topArtists, topTracks])

  return (
    <div className="summary-viz-root" ref={rootRef}>
      <div className="summary-kpi-grid">
        <article className={`summary-kpi-card ${isInView ? 'visible' : ''}`} style={{ transitionDelay: isInView ? '80ms' : '0ms' }}>
          <h4>Unique Artists (in top sets)</h4>
          <p>{artistCounts.size.toLocaleString()}</p>
        </article>

        <article className={`summary-kpi-card ${isInView ? 'visible' : ''}`} style={{ transitionDelay: isInView ? '220ms' : '0ms' }}>
          <h4>Top Artist</h4>
          <p>{topArtists[0]?.name ?? 'n/a'}</p>
        </article>

        <article className={`summary-kpi-card ${isInView ? 'visible' : ''}`} style={{ transitionDelay: isInView ? '360ms' : '0ms' }}>
          <h4>Top Song</h4>
          <p>{topTracks[0]?.name ?? 'n/a'}</p>
        </article>
      </div>

      <div className="summary-bars-grid">
        <section className={`summary-bars-panel ${isInView ? 'visible' : ''}`} style={{ transitionDelay: isInView ? '500ms' : '0ms' }}>
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
                    <div className="summary-bar-fill summary-bar-fill-count" data-target-width={`${width}%`} style={{ width: isInView ? `${width}%` : '0%' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={`summary-bars-panel ${isInView ? 'visible' : ''}`} style={{ transitionDelay: isInView ? '620ms' : '0ms' }}>
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
                    <div className="summary-bar-fill summary-bar-fill-share" data-target-width={`${width}%`} style={{ width: isInView ? `${width}%` : '0%' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}