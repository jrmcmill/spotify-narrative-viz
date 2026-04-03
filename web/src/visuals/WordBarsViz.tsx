import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import type { CSSProperties } from 'react'
import type { TooltipHandlers } from './types'

type CSSWithCustomProperties = CSSProperties & {
  '--target-width'?: string
}

type WordBarsVizProps = TooltipHandlers & {
  topWords: Array<{ word: string; count: number }>
  selectedMood: string
  selectedMoodKeywords: Set<string>
  isInView: boolean
}

export function WordBarsViz({
  topWords,
  selectedMood,
  selectedMoodKeywords,
  isInView,
  onTooltipEnter,
  onTooltipMove,
  onTooltipLeave,
}: WordBarsVizProps) {
  const items = useMemo(() => topWords.slice(0, 24), [topWords])
  const maxCount = items[0]?.count ?? 1
  const widthScale = useMemo(() => d3.scaleLinear().domain([0, maxCount]).range([0, 100]), [maxCount])
  const barsRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!barsRef.current) {
      return
    }

    const sel = d3.select(barsRef.current).selectAll<HTMLElement, unknown>('.word-fill')
    if (!isInView) {
      sel.interrupt().style('width', '0%')
      return
    }

    sel
      .interrupt()
      .style('width', '0%')
      .transition()
      .duration(850)
      .delay((_, idx) => idx * 30)
      .ease(d3.easeCubicOut)
      .style('width', function () {
        return (this as HTMLElement).dataset.targetWidth ?? '0%'
      })
  }, [isInView, items])

  return (
    <ul className="word-bars" ref={barsRef}>
      {items.map((item, idx) => {
        const width = widthScale(item.count)
        const moodHit = selectedMood === 'all' || selectedMoodKeywords.has(item.word)
        return (
          <li
            key={item.word}
            className={`word-bar-item ${moodHit ? 'mood-highlight' : 'mood-dim'}`}
            style={{ animationDelay: `${isInView ? idx * 30 : 0}ms` }}
            onMouseEnter={onTooltipEnter(`${item.word}: ${item.count.toLocaleString()} playlists`)}
            onMouseMove={onTooltipMove}
            onMouseLeave={onTooltipLeave}
          >
            <span className="word-label">{item.word}</span>
            <div className="word-track">
              <div
                className={`word-fill ${isInView ? 'animated' : ''}`}
                data-target-width={`${width}%`}
                style={{ '--target-width': `${width}%` } as CSSWithCustomProperties}
              />
            </div>
            <span className="word-count">{item.count.toLocaleString()}</span>
          </li>
        )
      })}
    </ul>
  )
}
