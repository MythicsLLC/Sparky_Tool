import { Box, CircularProgress } from '@mui/material'
import MythicsLogo from '../assets/MythicsLogo'
import { useThemeContext } from '../ThemeContext'

/**
 * MythicsLoader — Mythics logo centred inside a spinning circular ring.
 *
 * Props:
 *   size  — diameter of the spinner ring in px (default 80)
 *   sx    — extra styles on the outer centering Box (use for py, minHeight, etc.)
 */
export default function MythicsLoader({ size = 80, sx = {} }) {
  const { accent } = useThemeContext()

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...sx }}>
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <CircularProgress
          size={size}
          thickness={1.4}
          sx={{ color: accent, position: 'absolute', top: 0, left: 0 }}
        />
        <Box sx={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MythicsLogo width={Math.round(size * 0.65)} />
        </Box>
      </Box>
    </Box>
  )
}
