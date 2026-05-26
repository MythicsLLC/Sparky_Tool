# Design Spec: Mythics Branding + Startup Animation

**Date:** 2026-05-26  
**Status:** Approved

---

## Overview

Two related goals in one pass:
1. Establish **Mythics as the top-level brand** by replacing the SparkyDog image with the Mythics logo everywhere except the topbar and startup screen.
2. Elevate the **startup/loading screen** with the Mythics logo above the title and an interactive particle canvas background.

---

## Scope

### New Component: `MythicsLogo.jsx`

Location: `frontend/src/assets/MythicsLogo.jsx`

A thin wrapper around `mythics-logo-color.png` (already dropped in `frontend/src/assets/`). Mirrors the `SparkyDog.jsx` API:

```
Props:
  width  — pixel width (height scales proportionally). Default 120.
  style  — extra inline styles on the root <img> element.
```

Renders a plain `<img>` with `object-fit: contain`. No circular mode needed (the logo is not clipped).

---

### 1. `StartupScreen.jsx` — Two additions

#### A. Canvas Particle System

- A `<canvas>` element absolutely positioned behind all content (`zIndex: 0`), sized to `window.innerWidth × window.innerHeight`.
- Managed entirely via a `useRef` + `useEffect` (no React state = zero re-renders during animation).
- **Particle spec:** 45 particles. Each has `{ x, y, vx, vy, r, opacity }`.
  - `vx`, `vy`: random float in `[-0.4, 0.4]` px/frame
  - `r`: random in `[1, 2.5]` px
  - `opacity`: random in `[0.2, 0.6]`
- **Per-frame logic (requestAnimationFrame loop):**
  1. Clear canvas
  2. For each particle: advance `x += vx`, `y += vy`, wrap edges (teleport to opposite side)
  3. Mouse proximity check: if distance to mouse < 100px, apply a repulsion force (`strength = (100 - dist) * 0.04`) pushing the particle away. Cap speed at 3 px/frame.
  4. Draw particle as a filled circle using the theme `accent` color with per-particle opacity.
- Mouse position tracked via a `ref` (updated in a `mousemove` listener on `window`) — never triggers re-render.
- Canvas resizes on `window.resize` event.
- `useEffect` cleanup cancels the animation frame and removes event listeners.

#### B. Mythics Logo Above Title

- Import `MythicsLogo` and render it **above** the existing rotating-square/dog frame.
- Width: `110px`, with a `fadeIn 0.8s ease 0s both` animation (fires before the rest of the content).
- A thin horizontal rule (`linear-gradient` line, same style as the existing rules) separates the logo from the dog frame below it.

---

### 2. SparkyDog → MythicsLogo replacements

All four locations swap the import and the JSX element. SparkyDog is **not** removed from these files' imports if used elsewhere in the same file (it isn't — each file has exactly one usage being replaced).

| File | Line | Old | New |
|------|------|-----|-----|
| `frontend/src/pages/Dashboard.jsx` | ~266 | `<SparkyDog size={18} circular />` (run button icon) | `<MythicsLogo width={22} />` |
| `frontend/src/pages/Dashboard.jsx` | ~363 | `<SparkyDog size={72} circular style={{ opacity: 0.7 }} />` (empty state) | `<MythicsLogo width={100} style={{ opacity: 0.5 }} />` |
| `frontend/src/components/LoadingDialog.jsx` | ~65 | `<SparkyDog size={54} circular />` | `<MythicsLogo width={90} />` |
| `frontend/src/pages/SignIn.jsx` | ~45 | `<SparkyDog size={80} circular />` (inside glow ring) | `<MythicsLogo width={120} />` (glow ring removed; logo doesn't suit circular clipping) |

---

### 3. Files left unchanged

| File | Why |
|------|-----|
| `Topbar.jsx` | SparkyDog stays at all 3 usage sites (user decision) |
| `ThemeContext.jsx` | Favicon uses SparkyDog — browser tab identity stays |
| `StartupScreen.jsx` center icon | SparkyDog inside the rotating frame stays |

---

## Architecture Notes

- The canvas animation is self-contained inside a single `useEffect` in `StartupScreen.jsx`. It does not pollute any shared state or context.
- `MythicsLogo.jsx` is intentionally minimal — just an image wrapper. Styling/sizing responsibility stays at the call site.
- No new npm dependencies required. The particle system uses raw `requestAnimationFrame` (lighter than GSAP for this use case). GSAP remains available for other uses.
- The `accent` color from `useThemeContext()` is captured once at mount and passed into the canvas draw loop via a ref — so the canvas always reads the current accent without needing to re-subscribe.

---

## Out of Scope

- Replacing the favicon image (tab icon stays as SparkyDog)
- Changing Topbar branding
- Any changes to backend or routing
