import { useEffect, useState } from 'react'

/**
 * Hook that animates a number from 0 to target when trigger becomes true.
 */
export function useCountUp(target: number, trigger: boolean, duration: number = 1.2) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!trigger) {
      setCount(0)
      return
    }

    let start: number | null = null
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (start === null) start = timestamp
      const elapsed = timestamp - start
      const progress = Math.min(elapsed / (duration * 1000), 1)

      setCount(Math.floor(progress * target))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
  }, [trigger, target, duration])

  return count
}
