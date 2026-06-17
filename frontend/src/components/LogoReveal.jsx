import { useRef, useState, useEffect, useCallback } from 'react'
import { Box } from '@mui/material'
import mythicsLogoPng from '../assets/mythics-logo-color.png'

const lerp = (a, b, t) => a + (b - a) * t

/**
 * Renders the Mythics logo as a faint ghost outline.
 * Moving the mouse over it reveals full color in a soft circle
 * that follows the cursor with a spring-eased lerp.
 */
export default function LogoReveal({ width = 320, height = 200, revealRadius = 150 }) {
  const containerRef = useRef(null)
  const animRef      = useRef(null)
  const targetRef    = useRef({ x: 0, y: 0, r: 0 })
  const curRef       = useRef({ x: 0, y: 0, r: 0 })

  // mask is the only piece of state — everything else lives in refs
  const [mask, setMask] = useState(
    'radial-gradient(circle 0px at 50% 50%, black 0%, transparent 0%)'
  )

  const buildMask = ({ x, y, r }) =>
    `radial-gradient(circle ${r.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, black 35%, transparent 100%)`

  const tick = useCallback(() => {
    const t = targetRef.current
    const c = curRef.current
    c.x = lerp(c.x, t.x, 0.14)
    c.y = lerp(c.y, t.y, 0.14)
    c.r = lerp(c.r, t.r, 0.10)

    setMask(buildMask(c))

    const still =
      Math.abs(c.r - t.r) < 0.4 &&
      Math.abs(c.x - t.x) < 0.4 &&
      Math.abs(c.y - t.y) < 0.4

    if (still) {
      // snap and stop the loop
      c.x = t.x; c.y = t.y; c.r = t.r
      setMask(buildMask(t))
    } else {
      animRef.current = requestAnimationFrame(tick)
    }
  }, [])

  const startAnim = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(tick)
  }, [tick])

  const handleMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    targetRef.current.x = e.clientX - rect.left
    targetRef.current.y = e.clientY - rect.top
    startAnim()
  }, [startAnim])

  const handleMouseEnter = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    targetRef.current.x = e.clientX - rect.left
    targetRef.current.y = e.clientY - rect.top
    targetRef.current.r = revealRadius
    startAnim()
  }, [revealRadius, startAnim])

  const handleMouseLeave = useCallback(() => {
    targetRef.current.r = 0
    startAnim()
  }, [startAnim])

  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  return (
    <Box
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{ position: 'relative', width, height, userSelect: 'none', cursor: 'crosshair' }}
    >
      {/* Ghost layer — always visible, very faint grayscale */}
      <Box
        component="img"
        src={mythicsLogoPng}
        alt=""
        draggable={false}
        sx={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'contain',
          filter: 'grayscale(1) opacity(0.13)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      {/* Color reveal layer — clipped to a circle at cursor position */}
      <Box
        component="img"
        src={mythicsLogoPng}
        alt="Mythics"
        draggable={false}
        sx={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
    </Box>
  )
}
