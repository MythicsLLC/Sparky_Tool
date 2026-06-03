import { useRef, useEffect, useCallback } from 'react'
import gsap from 'gsap'

const PATHS = {
  bolt:     'M13,2 L6,14 L11,14 L9,22 L18,10 L13,10 Z',
  hexagon:  'M12,2 L20.7,7 L20.7,17 L12,22 L3.3,17 L3.3,7 Z',
  triangle: 'M12,3 L21.5,21 L2.5,21 Z',
  diamond:  'M12,2 L22,12 L12,22 L2,12 Z',
  star:     'M12,2 L14.4,9.1 L22,9.1 L15.9,13.9 L18.2,21 L12,16.3 L5.8,21 L8.1,13.9 L2,9.1 L9.6,9.1 Z',
  square:   'M3,3 L21,3 L21,21 L3,21 Z',
  circle:   null,
}

const SHAPE_CYCLE = ['bolt', 'diamond', 'triangle', 'hexagon', 'star', 'square', 'circle']

function ShapeIcon({ type, accent }) {
  return (
    <svg width="0.8em" height="0.8em" viewBox="0 0 24 24" style={{ display: 'block', overflow: 'visible' }}>
      {type === 'circle'
        ? <circle cx="12" cy="12" r="9" fill={accent} />
        : <path d={PATHS[type]} fill={accent} />
      }
    </svg>
  )
}

function AnimChar({ char, shapeType, accent }) {
  const charRef  = useRef(null)
  const shapeRef = useRef(null)

  useEffect(() => {
    gsap.set(shapeRef.current, { scale: 0, y: 5 })
    return () => gsap.killTweensOf([charRef.current, shapeRef.current])
  }, [])

  const handleEnter = useCallback(() => {
    gsap.killTweensOf([charRef.current, shapeRef.current])
    gsap.to(charRef.current,  { scale: 0, duration: 0.14, ease: 'power3.in' })
    gsap.to(shapeRef.current, { scale: 1, y: 0, duration: 0.32, ease: 'back.out(3)', delay: 0.08 })
  }, [])

  const handleLeave = useCallback(() => {
    gsap.killTweensOf([charRef.current, shapeRef.current])
    gsap.to(shapeRef.current, { scale: 0, y: 5, duration: 0.14, ease: 'power3.in' })
    gsap.to(charRef.current,  { scale: 1, duration: 0.6,  ease: 'elastic.out(1, 0.4)', delay: 0.08 })
  }, [])

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span ref={charRef} style={{ display: 'inline-block' }}>
        {char}
      </span>
      <span
        ref={shapeRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <ShapeIcon type={shapeType} accent={accent} />
      </span>
    </span>
  )
}

/**
 * Props:
 *   text   — the string to render, e.g. "Sparky Tool"
 *   accent — hex colour for the hover shapes (should match theme accent)
 */
export default function SparkyWordmark({ text = '', accent = '#c9a84c' }) {
  let shapeIdx = 0
  return (
    <>
      {text.split('').map((char, i) => {
        if (char === ' ') return (
          <span key={i} style={{ display: 'inline-block', width: '0.3em' }} />
        )
        const shape = SHAPE_CYCLE[shapeIdx++ % SHAPE_CYCLE.length]
        return <AnimChar key={i} char={char} shapeType={shape} accent={accent} />
      })}
    </>
  )
}
