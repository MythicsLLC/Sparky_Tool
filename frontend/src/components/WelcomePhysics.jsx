import { useEffect, useRef } from 'react'
import * as Matter from 'matter-js'

// Domain words echo the LoadingDialog status copy (PeopleSoft engine → SFTP → analytics)
// so the "full" welcome scene visually narrates what the tool actually does.
const CHIP_WORDS = ['PeopleSoft', 'SFTP', 'Engine', 'Analytics', 'Sync', 'Reports']

function drawStar(ctx, r, color) {
  const spikes = 5
  const outer = r
  const inner = r * 0.45
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (Math.PI * i) / spikes - Math.PI / 2
    const px = Math.cos(angle) * radius
    const py = Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawGear(ctx, r, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2)
  ctx.fill()
  const teeth = 8
  for (let i = 0; i < teeth; i++) {
    ctx.save()
    ctx.rotate((Math.PI * 2 * i) / teeth)
    ctx.fillRect(-r * 0.12, -r, r * 0.24, r * 0.34)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fill()
}

function drawRing(ctx, r, color) {
  ctx.lineWidth = r * 0.32
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2)
  ctx.stroke()
}

function drawChip(ctx, w, h, color, label) {
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(-w / 2 + r, -h / 2)
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r)
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r)
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r)
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r)
  ctx.closePath()
  ctx.fillStyle = `${color}d9`
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#fff'
  ctx.font = '600 11px "Raleway", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 0, 0.5)
}

/**
 * 2D physics playground built on Matter.js.
 *
 * variant="compact"  – small ambient scene (used behind the LoadingDialog logo): cheap,
 *                       non-interactive, no text/chains.
 * variant="full"      – the Dashboard "no configs" welcome scene: shapes, gears, rings,
 *                       domain-word chips, a swinging chain, mouse magnetism and a
 *                       double-click explosion burst.
 */
export default function WelcomePhysics({ accent = '#1976d2', interactive = true, variant = 'full' }) {
  const wrapperRef = useRef(null)
  const intervalRef = useRef(null)
  const pointerHandlerRef = useRef(null)
  const dblClickHandlerRef = useRef(null)
  const chipCountRef = useRef(0)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    // Bail out in environments without real 2D canvas support (e.g. jsdom in
    // unit tests, which has no native canvas backend) — this scene is purely
    // decorative, so skipping it there is safe and avoids a render crash.
    const probe = document.createElement('canvas')
    if (!probe.getContext('2d')) return

    const full = variant !== 'compact'
    chipCountRef.current = 0

    const width = el.clientWidth || el.offsetWidth || 300
    const height = el.clientHeight || el.offsetHeight || 160

    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner
    const Bodies = Matter.Bodies
    const Body = Matter.Body
    const World = Matter.World
    const Composite = Matter.Composite
    const Constraint = Matter.Constraint
    const Events = Matter.Events
    const Mouse = Matter.Mouse
    const MouseConstraint = Matter.MouseConstraint

    const engine = Engine.create({ gravity: { y: 0.6 } })
    const render = Render.create({
      element: el,
      engine,
      options: {
        width,
        height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 1,
      },
    })

    // walls
    const thickness = 80
    const walls = [
      Bodies.rectangle(width / 2, -thickness / 2, width + 100, thickness, { isStatic: true }),
      Bodies.rectangle(width / 2, height + thickness / 2, width + 100, thickness, { isStatic: true }),
      Bodies.rectangle(-thickness / 2, height / 2, thickness, height + 100, { isStatic: true }),
      Bodies.rectangle(width + thickness / 2, height / 2, thickness, height + 100, { isStatic: true }),
    ]
    World.add(engine.world, walls)

    const palette = [accent, '#6b8f71', '#c9a84c', '#6495b4', '#b45050']

    // a small swinging chain anchored near the top-right corner — purely decorative,
    // it gets knocked around as falling shapes brush past it
    if (full) {
      const chainX = width - 34
      const linkLen = 16
      const links = []
      for (let i = 0; i < 5; i++) {
        const link = Bodies.circle(chainX, 14 + i * linkLen, 6, {
          frictionAir: 0.015,
          render: { fillStyle: accent, strokeStyle: 'rgba(255,255,255,0.2)', lineWidth: 1 },
        })
        links.push(link)
      }
      World.add(engine.world, links)
      const constraints = [Constraint.create({ pointA: { x: chainX, y: -2 }, bodyB: links[0], length: linkLen, stiffness: 0.9 })]
      for (let i = 0; i < links.length - 1; i++) {
        constraints.push(Constraint.create({ bodyA: links[i], bodyB: links[i + 1], length: linkLen, stiffness: 0.9 }))
      }
      World.add(engine.world, constraints)
    }

    function spawn(x) {
      const r = Math.random() * 16 + 6
      const color = palette[Math.floor(Math.random() * palette.length)]
      const baseOpts = {
        restitution: 0.55 + Math.random() * 0.3,
        friction: 0.01,
        frictionAir: 0.01 + Math.random() * 0.03,
      }
      const left = x != null ? x : Math.random() * width
      const roll = Math.random()
      let body

      if (roll < 0.24) {
        body = Bodies.circle(left, -20, r, { ...baseOpts, render: { fillStyle: color, strokeStyle: 'rgba(255,255,255,0.08)', lineWidth: 1 } })
      } else if (roll < 0.42) {
        const sides = Math.floor(Math.random() * 4) + 3
        body = Bodies.polygon(left, -20, sides, r, { ...baseOpts, render: { fillStyle: color, strokeStyle: 'rgba(255,255,255,0.08)', lineWidth: 1 } })
      } else if (roll < 0.54) {
        body = Bodies.rectangle(left, -20, r * 2, r * 1.2, { ...baseOpts, render: { fillStyle: color, strokeStyle: 'rgba(255,255,255,0.08)', lineWidth: 1 } })
      } else if (roll < 0.7) {
        body = Bodies.circle(left, -20, r, { ...baseOpts, render: { visible: false } })
        body.plugin = { kind: 'star', r, color }
      } else if (roll < 0.82) {
        const gr = r + 6
        body = Bodies.circle(left, -20, gr, { ...baseOpts, frictionAir: 0.025, render: { visible: false } })
        body.plugin = { kind: 'gear', r: gr, color }
      } else if (full && chipCountRef.current < 4 && roll < 0.93) {
        const label = CHIP_WORDS[Math.floor(Math.random() * CHIP_WORDS.length)]
        const w = 20 + label.length * 7
        const h = 26
        body = Bodies.rectangle(left, -20, w, h, {
          ...baseOpts, frictionAir: 0.03, chamfer: { radius: h / 2 }, inertia: Infinity,
          render: { visible: false },
        })
        body.plugin = { kind: 'chip', w, h, color, label }
        chipCountRef.current += 1
      } else {
        body = Bodies.circle(left, -20, r, { ...baseOpts, render: { visible: false } })
        body.plugin = { kind: 'ring', r, color }
      }

      World.add(engine.world, body)

      // prune oldest dynamic bodies once the field gets crowded
      const cap = full ? 130 : 55
      const dynamic = engine.world.bodies.filter((b) => !b.isStatic)
      if (dynamic.length > cap) {
        dynamic.slice(0, dynamic.length - cap).forEach((b) => {
          if (b.plugin && b.plugin.kind === 'chip') chipCountRef.current = Math.max(0, chipCountRef.current - 1)
          try { Composite.remove(engine.world, b) } catch (e) {}
        })
      }
    }

    // initial burst
    for (let i = 0; i < (full ? 16 : 8); i++) spawn()

    const runner = Runner.create()
    Runner.run(runner, engine)
    Render.run(render)

    // custom canvas pass for the star / gear / ring / chip shapes (drawn over their
    // invisible Matter collision bodies so physics and visuals stay in sync)
    const drawCustom = () => {
      const ctx = render.context
      Composite.allBodies(engine.world).forEach((b) => {
        const kind = b.plugin && b.plugin.kind
        if (!kind) return
        ctx.save()
        ctx.translate(b.position.x, b.position.y)
        ctx.rotate(b.angle)
        ctx.shadowColor = b.plugin.color
        ctx.shadowBlur = 6
        if (kind === 'star') drawStar(ctx, b.plugin.r, b.plugin.color)
        else if (kind === 'gear') drawGear(ctx, b.plugin.r, b.plugin.color)
        else if (kind === 'ring') drawRing(ctx, b.plugin.r, b.plugin.color)
        else if (kind === 'chip') drawChip(ctx, b.plugin.w, b.plugin.h, b.plugin.color, b.plugin.label)
        ctx.restore()
      })
    }
    Events.on(render, 'afterRender', drawCustom)

    // gentle side-to-side gravity sway keeps the scene alive even with no interaction
    const gravityHandler = () => {
      engine.world.gravity.x = Math.sin(engine.timing.timestamp / 2600) * (full ? 0.18 : 0.05)
    }
    Events.on(engine, 'beforeUpdate', gravityHandler)

    let mouse = null
    let magnetHandler = null

    // interaction or auto spawn
    if (interactive) {
      mouse = Mouse.create(render.canvas)
      const mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.18, render: { visible: false } } })
      World.add(engine.world, mc)
      render.mouse = mouse

      const handler = (e) => {
        const rect = render.canvas.getBoundingClientRect()
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left
        for (let i = 0; i < 5; i++) spawn(x + (Math.random() - 0.5) * 40)
      }
      pointerHandlerRef.current = handler
      render.canvas.addEventListener('pointerdown', handler)
      render.canvas.addEventListener('touchstart', handler)

      if (full) {
        // softly pull nearby shapes toward the pointer when it isn't actively dragging
        magnetHandler = () => {
          if (mouse.button !== -1) return
          const mp = mouse.position
          if (!mp || (mp.x === 0 && mp.y === 0)) return
          engine.world.bodies.forEach((b) => {
            if (b.isStatic) return
            const dx = mp.x - b.position.x
            const dy = mp.y - b.position.y
            const distSq = dx * dx + dy * dy
            if (distSq > 100 && distSq < 36000) {
              const dist = Math.sqrt(distSq)
              const force = 0.00005 * (1 - dist / 190)
              Body.applyForce(b, b.position, { x: (dx / dist) * force, y: (dy / dist) * force })
            }
          })
        }
        Events.on(engine, 'beforeUpdate', magnetHandler)

        // double-click/tap: shockwave that flings nearby shapes outward + a fresh burst
        const explodeHandler = (e) => {
          const rect = render.canvas.getBoundingClientRect()
          const cx = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left
          const cy = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top
          engine.world.bodies.forEach((b) => {
            if (b.isStatic) return
            const dx = b.position.x - cx
            const dy = b.position.y - cy
            const dist = Math.max(Math.hypot(dx, dy), 1)
            if (dist < 240) {
              const power = 0.06 * (1 - dist / 240)
              Body.applyForce(b, b.position, { x: (dx / dist) * power, y: (dy / dist) * power - 0.012 })
            }
          })
          for (let i = 0; i < 6; i++) spawn(cx + (Math.random() - 0.5) * 30)
        }
        dblClickHandlerRef.current = explodeHandler
        render.canvas.addEventListener('dblclick', explodeHandler)
      }
    } else {
      intervalRef.current = setInterval(() => {
        if (engine.world.bodies.length < 100) spawn()
      }, 650)
    }

    // resize handling
    let resizeObserver = null
    try {
      resizeObserver = new ResizeObserver(() => {
        const w = el.clientWidth || width
        const h = el.clientHeight || height
        render.bounds.max.x = w
        render.bounds.max.y = h
        render.options.width = w
        render.options.height = h
        render.canvas.width = w * (window.devicePixelRatio || 1)
        render.canvas.height = h * (window.devicePixelRatio || 1)
        render.canvas.style.width = `${w}px`
        render.canvas.style.height = `${h}px`
      })
      resizeObserver.observe(el)
    } catch (e) {}

    return () => {
      try {
        if (intervalRef.current) clearInterval(intervalRef.current)
        if (pointerHandlerRef.current) {
          render.canvas.removeEventListener('pointerdown', pointerHandlerRef.current)
          render.canvas.removeEventListener('touchstart', pointerHandlerRef.current)
        }
        if (dblClickHandlerRef.current) render.canvas.removeEventListener('dblclick', dblClickHandlerRef.current)
        if (resizeObserver) resizeObserver.disconnect()
        Events.off(render, 'afterRender', drawCustom)
        Events.off(engine, 'beforeUpdate', gravityHandler)
        if (magnetHandler) Events.off(engine, 'beforeUpdate', magnetHandler)
        Render.stop(render)
        Runner.stop(runner)
        World.clear(engine.world, false)
        Engine.clear(engine)
        if (render.canvas && render.canvas.parentNode === el) render.canvas.parentNode.removeChild(render.canvas)
        render.textures = {}
      } catch (err) {}
    }
  }, [accent, interactive, variant])

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: interactive ? 'auto' : 'none' }} />
  )
}
