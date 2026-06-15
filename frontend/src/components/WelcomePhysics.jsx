import { useEffect, useRef } from 'react'
import * as Matter from 'matter-js'

export default function WelcomePhysics({ accent = '#1976d2', interactive = true }) {
  const wrapperRef = useRef(null)
  const intervalRef = useRef(null)
  const pointerHandlerRef = useRef(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const width = el.clientWidth || el.offsetWidth || 300
    const height = el.clientHeight || el.offsetHeight || 160

    const Engine = Matter.Engine
    const Render = Matter.Render
    const Runner = Matter.Runner
    const Bodies = Matter.Bodies
    const World = Matter.World
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

    function spawn(x) {
      const r = Math.random() * 16 + 6
      const rand = Math.random()
      let body
      const opts = {
        restitution: 0.6 + Math.random() * 0.25,
        friction: 0.01,
        frictionAir: 0.01 + Math.random() * 0.03,
        render: { fillStyle: palette[Math.floor(Math.random() * palette.length)], strokeStyle: 'rgba(255,255,255,0.06)', lineWidth: 1 },
      }
      const left = x || Math.random() * width
      if (rand < 0.4) body = Bodies.circle(left, -20, r, opts)
      else if (rand < 0.75) {
        const sides = Math.floor(Math.random() * 4) + 3
        body = Bodies.polygon(left, -20, sides, r, opts)
      } else body = Bodies.rectangle(left, -20, r * 2, r * 1.2, opts)

      World.add(engine.world, body)
      // prune
      if (engine.world.bodies.length > 120) {
        const toRemove = engine.world.bodies.slice(0, 20)
        toRemove.forEach((b) => { try { Matter.Composite.remove(engine.world, b) } catch (e) {} })
      }
    }

    // initial burst
    for (let i = 0; i < 10; i++) spawn()

    const runner = Runner.create()
    Runner.run(runner, engine)
    Render.run(render)

    // interaction or auto spawn
    if (interactive) {
      const mouse = Mouse.create(render.canvas)
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
        if (resizeObserver) resizeObserver.disconnect()
        Render.stop(render)
        Runner.stop(runner)
        World.clear(engine.world, false)
        Engine.clear(engine)
        if (render.canvas && render.canvas.parentNode === el) render.canvas.parentNode.removeChild(render.canvas)
        render.textures = {}
      } catch (err) {}
    }
  }, [accent, interactive])

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: interactive ? 'auto' : 'none' }} />
  )
}
