import { useEffect, useRef, useState } from 'react'

/**
 * Hook that returns true when an element becomes visible in the viewport.
 * Useful for triggering animations on scroll.
 */
export function useInView(options: IntersectionObserverInit = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true)
        observer.unobserve(entry.target)
      }
    }, {
      threshold: 0.15,
      ...options,
    })

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [options])

  return { ref, isInView }
}
