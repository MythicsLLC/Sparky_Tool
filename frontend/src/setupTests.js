import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Provide lightweight mocks for Auth and Theme contexts so unit tests
// can render components without requiring Clerk or MUI theme setup.
vi.mock('./AuthContext', () => {
  return {
    AuthProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useAuth: () => ({
      user: { id: 'test-user', name: 'Test User', onboarded: true },
      token: 'test-token',
      loading: false,
      error: null,
      signOut: () => {},
      markOnboarded: () => {},
      getToken: async () => 'test-token',
    }),
  }
})

vi.mock('./ThemeContext', () => {
  return {
    ThemeContextProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useThemeContext: () => ({ mode: 'dark', accent: '#E89918', accentDark: '#E89918', accentLight: '#C9A84C', toggleMode: () => {}, setAccentColor: () => {} }),
    ACCENT_OPTIONS: [
      { label: 'Sparky', value: '#E89918' },
      { label: 'Gold', value: '#c9a84c' },
      { label: 'Sapphire', value: '#4c7fc9' },
    ],
  }
})

// Provide a noop requestAnimationFrame to avoid recursive animation loops
if (typeof window !== 'undefined') {
  window.requestAnimationFrame = () => 0
  window.cancelAnimationFrame = () => {}
}

// Basic canvas mock so components using <canvas> don't throw in jsdom
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      measureText: () => ({ width: 0 }),
      createImageData: () => [],
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setTransform: () => {},
      fillText: () => {},
      stroke: () => {},
      closePath: () => {},
    }
  }
}
