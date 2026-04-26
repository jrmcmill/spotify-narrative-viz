// ── Spotify PKCE Auth Helpers ─────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI = window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5173/'
  : 'https://jrmcmill.github.io/spotify-narrative-viz/'
const SCOPES = 'playlist-read-private playlist-read-collaborative user-top-read'

// ── PKCE utilities ────────────────────────────────────────────────────────────
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ── Auth flow ─────────────────────────────────────────────────────────────────
export async function redirectToSpotifyAuth(): Promise<void> {
  const verifier = generateRandomString(64)
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem('spotify_verifier', verifier)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCodeForToken(code: string): Promise<string | null> {
  const verifier = sessionStorage.getItem('spotify_verifier')
  if (!verifier) return null
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) return null
  const data = await res.json()
  sessionStorage.removeItem('spotify_verifier')
  sessionStorage.setItem('spotify_token', data.access_token)
  window.history.replaceState({}, '', window.location.pathname)
  return data.access_token as string
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem('spotify_token')
}

export function clearToken(): void {
  sessionStorage.removeItem('spotify_token')
}

// ── Spotify API helpers ───────────────────────────────────────────────────────
async function spotifyGet<T>(endpoint: string, token: string): Promise<T | null> {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type SpotifyUser = { id: string; display_name: string }

export type SpotifyTopTrack = {
  id: string
  name: string
  artists: Array<{ name: string }>
  album: {
    name: string
    images: Array<{ url: string }>
  }
  explicit: boolean
}

export type SpotifyPlaylist = {
  id: string
  name: string
  owner: { id: string }
  tracks: { total: number } | null
  images: Array<{ url: string }>
}

// ── API calls ─────────────────────────────────────────────────────────────────
export async function fetchCurrentUser(token: string): Promise<SpotifyUser | null> {
  return spotifyGet<SpotifyUser>('/me', token)
}

export async function fetchTopTracks(token: string, limit = 20): Promise<SpotifyTopTrack[]> {
  const data = await spotifyGet<{ items: SpotifyTopTrack[] }>(
    `/me/top/tracks?limit=${limit}&time_range=medium_term`,
    token
  )
  return data?.items ?? []
}

export async function fetchUserPlaylists(token: string): Promise<SpotifyPlaylist[]> {
  const data = await spotifyGet<{ items: SpotifyPlaylist[] }>('/me/playlists?limit=50', token)
  return data?.items ?? []
}
