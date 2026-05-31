import mythicsLogoPng from './mythics-logo-color.png'

/**
 * MythicsLogo — renders the Mythics brand logo.
 *
 * Props:
 *   width  — pixel width (height scales proportionally). Default 120.
 *   style  — extra inline styles on the root element.
 */
export default function MythicsLogo({ width = 30, style = {} }) {
  return (
    <img
      src={mythicsLogoPng}
      alt="Mythics"
      width={width}
      style={{ display: 'block', objectFit: 'contain', maxWidth: '100%', ...style }}
      draggable={false}
    />
  )
}
