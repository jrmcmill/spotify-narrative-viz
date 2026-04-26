import { useEffect, useMemo, useState } from 'react'
import type { MoodProfiles, TooltipHandlers } from './types'
import {
  redirectToSpotifyAuth,
  exchangeCodeForToken,
  getStoredToken,
  clearToken,
  fetchCurrentUser,
  fetchTopTracks,
  type SpotifyTopTrack,
  type SpotifyUser,
} from './spotifyAuth'

// ── Mood metadata ─────────────────────────────────────────────────────────────
const MOOD_META: Record<string, { label: string; emoji: string; color: string }> = {
  hype:      { label: 'Hype',      emoji: '🔥', color: '#e63946' },
  workout:   { label: 'Workout',   emoji: '💪', color: '#f4a261' },
  road_trip: { label: 'Road Trip', emoji: '🚗', color: '#2a9d8f' },
  romance:   { label: 'Romance',   emoji: '💕', color: '#e76f51' },
  study:     { label: 'Study',     emoji: '📚', color: '#457b9d' },
  sad:       { label: 'Sad',       emoji: '🌧️', color: '#6b8cae' },
  sleep:     { label: 'Sleep',     emoji: '🌙', color: '#8ecae6' },
}

// ── Mood matching ─────────────────────────────────────────────────────────────
function buildArtistMoodMap(moodProfiles: MoodProfiles): Map<string, string[]> {
  const map = new Map<string, string[]>()
  Object.entries(moodProfiles).forEach(([mood, profile]) => {
    profile.topArtists.forEach(({ name }) => {
      const key = name.toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(mood)
    })
  })
  return map
}

function matchTrackToMoods(track: SpotifyTopTrack, artistMap: Map<string, string[]>): string[] {
  const moods = new Set<string>()
  track.artists.forEach(({ name }) => {
    const matched = artistMap.get(name.toLowerCase()) ?? []
    matched.forEach((m) => moods.add(m))
  })
  return [...moods]
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SpotifyUserVizProps = TooltipHandlers & {
  moodProfiles: MoodProfiles | null
}

type Stage = 'idle' | 'loading' | 'done' | 'error'

type TrackWithMoods = SpotifyTopTrack & { moods: string[] }

// ── Component ─────────────────────────────────────────────────────────────────
export function SpotifyUserViz({ moodProfiles, onTooltipEnter, onTooltipMove, onTooltipLeave }: SpotifyUserVizProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<SpotifyUser | null>(null)
  const [tracks, setTracks] = useState<TrackWithMoods[]>([])
  const [error, setError] = useState<string | null>(null)

  // Build artist → mood lookup from dataset
  const artistMoodMap = useMemo(() => {
    if (!moodProfiles) return new Map<string, string[]>()
    return buildArtistMoodMap(moodProfiles)
  }, [moodProfiles])

  // Handle OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    const load = async (t: string) => {
      const [u, topTracks] = await Promise.all([
        fetchCurrentUser(t),
        fetchTopTracks(t, 20),
      ])
      setUser(u)
      const withMoods: TrackWithMoods[] = topTracks.map((track) => ({
        ...track,
        moods: matchTrackToMoods(track, artistMoodMap),
      }))
      setTracks(withMoods)
      setStage('done')
    }

    if (code) {
      setStage('loading')
      exchangeCodeForToken(code).then((t) => {
        if (!t) { setError('Authentication failed.'); setStage('error'); return null }
        setToken(t)
        return load(t)
      }).catch(() => { setError('Something went wrong. Please try again.'); setStage('error') })
      return
    }

    const stored = getStoredToken()
    if (stored) {
      setToken(stored)
      setStage('loading')
      load(stored).catch(() => setStage('idle'))
    }
  }, [artistMoodMap])

  // ── Mood breakdown ────────────────────────────────────────────────────────
  const moodCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    tracks.forEach((t) => t.moods.forEach((m) => { counts[m] = (counts[m] ?? 0) + 1 }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [tracks])

  const totalMatched = useMemo(() => tracks.filter((t) => t.moods.length > 0).length, [tracks])
  const topMood = moodCounts[0]?.[0] ?? null
  const unmatchedCount = tracks.filter((t) => t.moods.length === 0).length

  const handleConnect = () => redirectToSpotifyAuth()
  const handleDisconnect = () => {
    clearToken()
    setToken(null)
    setStage('idle')
    setTracks([])
    setUser(null)
    setError(null)
  }

  const MOCK_TRACKS: TrackWithMoods[] = [
    { id: '1', name: "God's Plan", artists: [{ name: 'Drake' }], album: { name: '', images: [] }, explicit: false, moods: ['hype', 'sad'] },
    { id: '2', name: 'HUMBLE.', artists: [{ name: 'Kendrick Lamar' }], album: { name: '', images: [] }, explicit: true, moods: ['hype', 'workout'] },
    { id: '3', name: 'Shape of You', artists: [{ name: 'Ed Sheeran' }], album: { name: '', images: [] }, explicit: false, moods: ['romance', 'sad'] },
    { id: '4', name: 'Lose Yourself', artists: [{ name: 'Eminem' }], album: { name: '', images: [] }, explicit: true, moods: ['workout', 'hype'] },
    { id: '5', name: 'Hello', artists: [{ name: 'Adele' }], album: { name: '', images: [] }, explicit: false, moods: ['sad'] },
    { id: '6', name: 'Needed Me', artists: [{ name: 'Rihanna' }], album: { name: '', images: [] }, explicit: false, moods: ['hype', 'romance', 'workout'] },
    { id: '7', name: 'Ultralight Beam', artists: [{ name: 'Kanye West' }], album: { name: '', images: [] }, explicit: false, moods: ['hype', 'road_trip'] },
    { id: '8', name: 'Stay With Me', artists: [{ name: 'Sam Smith' }], album: { name: '', images: [] }, explicit: false, moods: ['sad', 'romance'] },
    { id: '9', name: 'Stressed Out', artists: [{ name: 'Twenty One Pilots' }], album: { name: '', images: [] }, explicit: false, moods: ['road_trip', 'sad'] },
    { id: '10', name: 'Work', artists: [{ name: 'Rihanna' }], album: { name: '', images: [] }, explicit: false, moods: ['hype', 'romance', 'workout'] },
  ]

  const handlePreview = () => {
    setTracks(MOCK_TRACKS)
    setUser({ id: 'preview', display_name: 'Sample Listener' })
    setStage('done')
  }

  if (!moodProfiles) return null

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (stage === 'idle') return (
    <div className="spotify-connect-panel">
      <div className="spotify-connect-inner">
        <span className="spotify-connect-icon">🎧</span>
        <h3 className="spotify-connect-title">See where your taste fits</h3>
        <p className="spotify-connect-desc">
          Connect Spotify to map your top tracks against the mood categories
          we found across a million playlists.
        </p>
        <button className="spotify-connect-btn" onClick={handleConnect}>
          Connect Spotify
        </button>
        <button className="spotify-preview-btn" onClick={handlePreview}>
          Preview with sample data
        </button>
        <p className="spotify-connect-note">
          Only reads your top tracks. Nothing is stored.
        </p>
      </div>
    </div>
  )

  // ── Loading ───────────────────────────────────────────────────────────────
  if (stage === 'loading') return (
    <div className="spotify-loading">
      <span className="spotify-loading-spinner" />
      <p>Analyzing your listening…</p>
    </div>
  )

  // ── Error ─────────────────────────────────────────────────────────────────
  if (stage === 'error') return (
    <div className="spotify-error">
      <span style={{ fontSize: '2rem' }}>😔</span>
      <p>{error}</p>
      <button className="spotify-connect-btn" onClick={handleDisconnect}>Try again</button>
    </div>
  )

  // ── Results ───────────────────────────────────────────────────────────────
  const maxCount = moodCounts[0]?.[1] ?? 1

  return (
    <div className="spotify-results">

      {/* Header */}
      <div className="spotify-user-header">
        <div className ="spotify-user-text">
          <p className="spotify-user-greeting">
            {user?.display_name ? `Hey ${user.display_name} —` : 'Your sound —'}
          </p>
          {topMood ? (
            <p className="spotify-user-summary">
              Your top tracks skew toward{' '}
              <span style={{ color: MOOD_META[topMood]?.color, fontWeight: 700 }}>
                {MOOD_META[topMood]?.emoji} {MOOD_META[topMood]?.label}
              </span>
              {moodCounts[1] && (
                <> and{' '}
                  <span style={{ color: MOOD_META[moodCounts[1][0]]?.color, fontWeight: 700 }}>
                    {MOOD_META[moodCounts[1][0]]?.emoji} {MOOD_META[moodCounts[1][0]]?.label}
                  </span>
                </>
              )}
              {unmatchedCount > 0 && totalMatched < tracks.length && (
                <> — with {unmatchedCount} track{unmatchedCount > 1 ? 's' : ''} outside our dataset</>
              )}.
            </p>
          ) : (
            <p className="spotify-user-summary">
              None of your top artists appear in our dataset — which makes sense.
              The Million Playlists dataset was collected in 2017, and your taste
              skews toward artists who emerged after that. The mood categories here
              reflect a different era of Spotify culture.
            </p>
          )}
        </div>
        <button className="spotify-disconnect-btn" onClick={handleDisconnect}>Disconnect</button>
      </div>

      <div className="mood-charts-grid">

        {/* Mood breakdown bars */}
        <div className="mood-chart-panel">
          <p className="mood-panel-title">Mood Distribution</p>
          {moodCounts.length === 0 ? (
            <p style={{ color: 'var(--sp-light-gray)', fontSize: '0.85rem', padding: '1rem 0' }}>
              None of your top artists appear in our mood dataset.
            </p>
          ) : (
            <div className="spotify-mood-bars">
              {moodCounts.map(([mood, count]) => {
                const meta = MOOD_META[mood]
                const pct = Math.round((count / maxCount) * 100)
                return (
                  <div key={mood} className="spotify-mood-bar-row"
                    onMouseEnter={onTooltipEnter(`${meta?.label}: ${count} of your top tracks`)}
                    onMouseMove={onTooltipMove}
                    onMouseLeave={onTooltipLeave}
                  >
                    <span className="spotify-mood-bar-label">
                      {meta?.emoji} {meta?.label}
                    </span>
                    <div className="spotify-mood-bar-track">
                      <div
                        className="spotify-mood-bar-fill"
                        style={{ width: `${pct}%`, background: meta?.color }}
                      />
                    </div>
                    <span className="spotify-mood-bar-count">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mood-footnote">Based on your top 20 tracks · medium term</p>
        </div>

        {/* Track list */}
        <div className="mood-chart-panel">
          <p className="mood-panel-title">Your Top Tracks</p>
          <div className="spotify-track-list">
            {tracks.map((track, i) => (
              <div key={track.id} className="spotify-track-row">
                <span className="spotify-track-num">{i + 1}</span>
                {track.album.images?.[2]?.url && (
                  <img src={track.album.images[2].url} alt="" className="spotify-track-img" />
                )}
                <div className="spotify-track-info">
                  <span className="spotify-track-name">{track.name}</span>
                  <span className="spotify-track-artist">
                    {track.artists.map((a) => a.name).join(', ')}
                  </span>
                </div>
                <div className="spotify-track-moods">
                  {track.moods.length > 0 ? track.moods.map((m) => (
                    <span
                      key={m}
                      className="spotify-track-mood-tag"
                      style={{ borderColor: `${MOOD_META[m]?.color}66`, color: MOOD_META[m]?.color }}
                    >
                      {MOOD_META[m]?.emoji}
                    </span>
                  )) : (
                    <span className="spotify-track-uncharted">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
      <p className="spotify-api-note">
        ⓘ Spotify deprecated audio feature access for new apps in late 2024, so mood matching is based on artist overlap with our dataset rather than acoustic analysis.
      </p>
    </div>
  )
}
