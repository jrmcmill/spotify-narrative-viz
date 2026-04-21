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

  // ✅ Sort + limit
  const items = useMemo(
    () =>
      [...topWords]
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    [topWords]
  )

  const maxCount = items.length > 0 ? items[0].count : 1

  const widthScale = useMemo(
    () => d3.scaleLinear().domain([0, maxCount]).range([0, 100]),
    [maxCount]
  )

  const barsRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!barsRef.current) return

    const sel = d3.select(barsRef.current).selectAll<HTMLElement, unknown>('.word-fill')

    if (!isInView) {
      sel.interrupt().style('width', '0%')
      return
    }

    sel
      .interrupt()
      .style('width', '0%')
      .transition()
      .duration(1700)
      .delay((_, idx) => idx * 30)
      .ease(d3.easeCubicOut)
      .style('width', function () {
        return (this as HTMLElement).dataset.targetWidth ?? '0%'
      })
  }, [isInView, items])

  return (
    <div>
      <h2>How {selectedMood} playlists speak</h2>
      <p className="subtitle">Most common words used in playlist titles</p>

      {/* ✅ Narrative insight */}
      <p className="insight">
        The most dominant word is "{items[0]?.word}", appearing more frequently than any other.
      </p>

      <ul className="word-bars" ref={barsRef}>
        {items.map((item, idx) => {
          const width = widthScale(item.count)

          const isTop3 = idx < 3
          const isKeyword = selectedMoodKeywords.has(item.word)

          return (
            <li
              key={item.word}
              className={`word-bar-item 
                ${isKeyword ? 'mood-highlight' : 'mood-dim'} 
                ${isTop3 ? 'top-word' : ''}
              `}
              style={{ animationDelay: `${isInView ? idx * 30 : 0}ms` }}
              onMouseEnter={onTooltipEnter(
                `${item.word} appears in ${item.count.toLocaleString()} playlists`
              )}
              onMouseMove={onTooltipMove}
              onMouseLeave={onTooltipLeave}
            >
              {/* ✅ Ranked labels */}
              <span className="word-label">
                {idx + 1}. {item.word}
              </span>

              <div className="word-track">
                <div
                  className={`word-fill ${isInView ? 'animated' : ''}`}
                  data-target-width={`${width}%`}
                  style={{ '--target-width': `${width}%` } as CSSWithCustomProperties}
                />
              </div>

              <span className="word-count">
                {item.count.toLocaleString()}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}