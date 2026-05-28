import { Component } from 'react'
import { Box, Typography, Button } from '@mui/material'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const msg = this.state.error?.message || String(this.state.error)

    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        bgcolor: 'background.default', px: 4, textAlign: 'center',
      }}>
        <Box sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'error.main', opacity: 0.4, display: 'grid', placeItems: 'center', mb: 3 }}>
          <Typography sx={{ color: 'error.main', fontSize: '1.2rem', fontWeight: 700 }}>!</Typography>
        </Box>
        <Typography sx={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.5rem', fontWeight: 600, color: 'text.primary', mb: 1 }}>
          Something went wrong
        </Typography>
        <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: 'text.secondary', mb: 3, maxWidth: 520, wordBreak: 'break-word' }}>
          {msg}
        </Typography>
        <Button
          onClick={() => { this.setState({ error: null }); window.location.reload() }}
          variant="outlined"
          color="primary"
          sx={{ borderRadius: '1px', fontFamily: '"Raleway"', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.14em' }}
        >
          Reload page
        </Button>
      </Box>
    )
  }
}
