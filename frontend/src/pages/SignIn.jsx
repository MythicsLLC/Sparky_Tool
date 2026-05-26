import { Box, Typography } from '@mui/material'
import { SignIn } from '@clerk/clerk-react'
import MythicsLogo from '../assets/MythicsLogo'
import { useThemeContext } from '../ThemeContext'

export default function SignInPage() {
  const { accent } = useThemeContext()

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle diagonal pattern */}
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(135deg, ${accent}08 0px, ${accent}08 1px, transparent 1px, transparent 60px)`,
      }} />

      {/* Corner marks */}
      {[
        { top: 24, left: 24, borderTop: '1px solid', borderLeft: '1px solid' },
        { top: 24, right: 24, borderTop: '1px solid', borderRight: '1px solid' },
        { bottom: 24, left: 24, borderBottom: '1px solid', borderLeft: '1px solid' },
        { bottom: 24, right: 24, borderBottom: '1px solid', borderRight: '1px solid' },
      ].map((s, i) => (
        <Box key={i} sx={{ position: 'absolute', width: 20, height: 20, borderColor: `${accent}2e`, ...s }} />
      ))}

      <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', mb: 5 }}>
        {/* Mythics logo with subtle glow */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
          <Box sx={{
            filter: `drop-shadow(0 0 18px ${accent}55)`,
            '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
            animation: 'fadeIn 0.8s ease both',
          }}>
            <MythicsLogo width={140} />
          </Box>
        </Box>
        <Typography sx={{
          fontFamily: '"Cormorant Garamond", serif',
          fontSize: '1.6rem',
          fontWeight: 700,
          letterSpacing: '0.28em',
          color: accent,
          textTransform: 'uppercase',
          mb: 0.5,
        }}>
          Sparky Tool
        </Typography>
        <Box sx={{ height: '1px', width: 120, background: `linear-gradient(90deg, transparent, ${accent}66, transparent)`, mx: 'auto', mb: 0.5 }} />
        <Typography sx={{ fontFamily: '"Raleway", sans-serif', fontSize: '0.55rem', letterSpacing: '0.35em', color: 'text.disabled', textTransform: 'uppercase' }}>
          Analytics Platform
        </Typography>
      </Box>

      <Box sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480, px: 2 }}>
        <SignIn routing="virtual" />
      </Box>
    </Box>
  )
}
