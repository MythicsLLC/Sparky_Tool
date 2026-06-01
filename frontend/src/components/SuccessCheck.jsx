import { useRef } from 'react'
import { Box } from '@mui/material'
import { useThemeContext } from '../ThemeContext'

/**
 * Google-Pay-style animated success checkmark.
 *
 * Timeline:
 *   0 – 60 ms  : background circle scales in + fades
 *   60 – 560 ms : ring draws clockwise from top (cubic-bezier)
 *   460 – 760 ms: checkmark path draws with drop-shadow glow
 *   550 – 850 ms: whole icon scales up then springs back (1.0 → 1.12 → 1.0)
 *   600 – 900 ms: 6 particles burst outward at 60° intervals then fade
 */
export default function SuccessCheck({ size = 64, color }) {
  const { accent } = useThemeContext()
  const c   = color ?? accent
  const uid = useRef(`sc_${Math.random().toString(36).slice(2, 7)}`).current

  const r     = 36                       // SVG-space radius (viewBox 100×100)
  const circ  = +(2 * Math.PI * r).toFixed(2)  // ≈ 226.19
  const cx    = 50
  const cy    = 50

  // 6 particles at 60° steps — alternating large/small
  const particles = [0, 60, 120, 180, 240, 300].map((deg, i) => {
    const rad  = (deg * Math.PI) / 180
    const dist = size * 0.62
    return {
      tx:    Math.round(Math.cos(rad) * dist),
      ty:    Math.round(Math.sin(rad) * dist),
      dot:   i % 2 === 0 ? size * 0.105 : size * 0.068,
      delay: 0.62 + i * 0.025,
      alpha: i % 3 === 0 ? 'ff' : i % 3 === 1 ? 'cc' : '88',
    }
  })

  const css = `
    @keyframes ${uid}_bg {
      0%   { opacity:0; transform:scale(0.55); }
      70%  { opacity:1; transform:scale(1.05); }
      100% { opacity:1; transform:scale(1); }
    }
    @keyframes ${uid}_ring {
      to { stroke-dashoffset: 0; }
    }
    @keyframes ${uid}_tick {
      to { stroke-dashoffset: 0; }
    }
    @keyframes ${uid}_glow {
      0%   { opacity:0; }
      50%  { opacity:1; }
      100% { opacity:0; }
    }
    @keyframes ${uid}_wrap {
      0%   { transform: scale(0.88); }
      55%  { transform: scale(1.0); }
      72%  { transform: scale(1.12); }
      100% { transform: scale(1.0); }
    }
    ${particles.map((p, i) => `
      @keyframes ${uid}_p${i} {
        0%   { transform: translate(-50%,-50%) scale(1.4); opacity: 0.9; }
        80%  { opacity: 0.6; }
        100% { transform: translate(calc(-50% + ${p.tx}px), calc(-50% + ${p.ty}px)) scale(0); opacity: 0; }
      }
    `).join('')}
  `

  return (
    <>
      <style>{css}</style>
      <Box sx={{
        position: 'relative',
        width:  size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {/* ── animated SVG ── */}
        <Box sx={{
          animation: `${uid}_wrap 0.52s cubic-bezier(0.34, 1.56, 0.64, 1) 0.52s both`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* subtle drop-shadow filter for the ring */}
              <filter id={`${uid}_gf`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={c} floodOpacity="0.55" />
              </filter>
            </defs>

            {/* soft background circle — scales in first */}
            <circle
              cx={cx} cy={cy} r="46"
              fill={c}
              fillOpacity="0.12"
              style={{ animation: `${uid}_bg 0.35s cubic-bezier(0.34,1.56,0.64,1) 0s both` }}
            />

            {/* faint track ring (always visible, gives depth) */}
            <circle
              cx={cx} cy={cy} r={r}
              stroke={c}
              strokeOpacity="0.18"
              strokeWidth="3.5"
            />

            {/* ── animated ring drawing clockwise from the top ── */}
            <circle
              cx={cx} cy={cy} r={r}
              stroke={c}
              strokeWidth="4.8"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ}
              filter={`url(#${uid}_gf)`}
              style={{
                transformOrigin: '50% 50%',
                transform: 'rotate(-90deg)',
                animation: `${uid}_ring 0.52s cubic-bezier(0.65, 0, 0.35, 1) 0.06s forwards`,
              }}
            />

            {/* secondary thin inner ring for depth */}
            <circle
              cx={cx} cy={cy} r={r - 6}
              stroke={c}
              strokeOpacity="0.1"
              strokeWidth="1"
              strokeDasharray={`${circ * 0.12} ${circ * 0.88}`}
              style={{
                transformOrigin: '50% 50%',
                transform: 'rotate(-90deg)',
                animation: `${uid}_ring 0.52s cubic-bezier(0.65, 0, 0.35, 1) 0.06s forwards`,
              }}
            />

            {/* ── animated checkmark ── */}
            <path
              d="M 22 52 L 40 68 L 76 30"
              stroke={c}
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="80"
              strokeDashoffset="80"
              filter={`url(#${uid}_gf)`}
              style={{ animation: `${uid}_tick 0.34s cubic-bezier(0.65, 0, 0.35, 1) 0.46s forwards` }}
            />

            {/* brief white flash on the tick just after it finishes */}
            <path
              d="M 22 52 L 40 68 L 76 30"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0"
              strokeDasharray="80"
              strokeDashoffset="80"
              style={{ animation: `${uid}_tick 0.34s cubic-bezier(0.65, 0, 0.35, 1) 0.46s forwards, ${uid}_glow 0.4s ease 0.78s both` }}
            />
          </svg>
        </Box>

        {/* ── particle burst ── */}
        {particles.map((p, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width:  p.dot,
              height: p.dot,
              borderRadius: '50%',
              bgcolor: `${c}${p.alpha}`,
              animation: `${uid}_p${i} 0.58s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s both`,
            }}
          />
        ))}
      </Box>
    </>
  )
}
