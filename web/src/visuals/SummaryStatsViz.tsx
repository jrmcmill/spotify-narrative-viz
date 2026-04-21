type Props = {
  topWords: Array<{ word: string; count: number }>
}

export function SummaryStatsViz({ topWords }: Props) {
  if (!topWords || topWords.length === 0) return null

  const totalWords = topWords.length
  const topWord = topWords[0]
  const totalCount = topWords.reduce((sum, d) => sum + d.count, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div>
          <h4>Total Top Words</h4>
          <p>{totalWords}</p>
        </div>

        <div>
          <h4>Most Common Word</h4>
          <p>{topWord.word}</p>
        </div>

        <div>
          <h4>Total Word Uses</h4>
          <p>{totalCount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}