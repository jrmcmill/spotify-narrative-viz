import type { MouseEvent } from 'react'

export type Summary = {
  totalPlaylists: number
  totalTracksSeen: number
  totalArtistsSeen?: number
  categories: Record<string, number>
  topWords: Array<{ word: string; count: number }>
  generatedFromSlices: number
}

export type TitleClusters = {
  points: Array<{ title: string; count: number; x: number; y: number; cluster: number }>
  clusters: Array<{ id: number; label: string; topTerms: string[]; size: number; weight: number }>
}

export type MoodProfile = {
  playlists: number
  topTracks: Array<{ name: string; artist?: string; count: number }>
  topArtists: Array<{ name: string; count: number }>
  avgFeatures: Record<string, number>
  examples: string[]
}

export type MoodProfiles = Record<string, MoodProfile>

export type ConsensusRow = {
  category: string
  playlists: number
  simpson: number
  top50AvgShare: number
  uniqueTracks: number
}

export type FlowPoint = {
  bin: number
  energy: number | null
  valence: number | null
  tempo: number | null
}

export type FlowFeatureKey = 'energy' | 'valence' | 'tempo'

export type FlowSampleSong = {
  name: string
  artist: string
  pos: number
}

export type FlowSamplePlaylist = {
  playlistName: string
  trackCount: number
  tracksWithFeatures: number
  exampleSongs: FlowSampleSong[]
  flow: FlowPoint[]
}

export type FlowSamplesData = Record<string, FlowSamplePlaylist[]>

export type HistogramBucket = {
  bucketMin: number
  bucketMax: number
  bucketLabel: string
  count: number
}

export type HistogramData = {
  label: string
  buckets: HistogramBucket[]
  stats: {
    min: number
    max: number
    median: number
    mean: number
  }
}

export type SummaryHistograms = {
  totalPlaylists: number
  artistCountHistogram: HistogramData
  trackCountHistogram: HistogramData
}

export type TooltipState = {
  visible: boolean
  text: string
  x: number
  y: number
}

export type TooltipHandlers = {
  onTooltipEnter: (text: string) => (event: MouseEvent<HTMLElement | SVGElement>) => void
  onTooltipMove: (event: MouseEvent<HTMLElement | SVGElement>) => void
  onTooltipLeave: () => void
}
