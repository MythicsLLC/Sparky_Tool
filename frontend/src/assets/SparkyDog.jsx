import sparkyPng from './sparky-dog.png'

/**
 * SparkyDog — renders the real Sparky PNG.
 *
 * Props:
 *   size     — pixel width (and height when circular). Default 200.
 *   circular — clips into a perfect circle with object-fit:cover. Default false.
 *   style    — extra inline styles on the root element.
 */
export default function SparkyDog({ size = 200, circular = false, style = {} }) {
  if (circular) {
    // A span wrapper is used so this works whether the parent is flex, inline, block, etc.
    // lineHeight:0 removes the 4 px "descender gap" browsers add below inline img elements.
    return (
      <span style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        lineHeight: 0,
        ...style,
      }}>
        <img
          src={sparkyPng}
          alt="Sparky"
          width={size}
          height={size}
          style={{ objectFit: 'cover', objectPosition: 'center 18%', display: 'block' }}
          draggable={false}
        />
      </span>
    )
  }

  return (
    <img
      src={sparkyPng}
      alt="Sparky — the PeopleSoft mascot"
      width={size}
      style={{ display: 'block', objectFit: 'contain', maxWidth: '100%', ...style }}
      draggable={false}
    />
  )
}
