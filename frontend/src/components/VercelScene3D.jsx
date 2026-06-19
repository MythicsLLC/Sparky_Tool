import { Component, useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Pure Three.js — no @react-three/fiber, no @react-three/drei.
// Both have module-init code that crashes with three@0.184 in production builds.
// Raw Three.js core + OrbitControls from examples are unaffected.

const STATE_COLOR = {
  READY:    '#6b8f71',
  ERROR:    '#b45050',
  BUILDING: '#c9a84c',
  QUEUED:   '#c9a84c',
  CANCELED: '#3a3a4a',
}

function spiralPositions(count, cx = 0, cz = 0, minR = 1.4, maxR = 3.4) {
  const phi = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const t = count < 2 ? 0 : i / (count - 1)
    const r = minR + t * (maxR - minR)
    return new THREE.Vector3(
      cx + Math.cos(phi * i) * r,
      Math.sin(i * 1.6) * 0.75,
      cz + Math.sin(phi * i) * r,
    )
  })
}

// ── Error boundary wraps the mount div ───────────────────────────────────────
class Scene3DErrorBoundary extends Component {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  componentDidCatch(err) { console.error('[VercelScene3D]', err) }
  render() {
    if (this.state.crashed) {
      return (
        <div style={styles.fallback}>
          <span style={styles.fallbackText}>3D scene failed to render</span>
          <button onClick={() => this.setState({ crashed: false })} style={styles.retryBtn}>RETRY</button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Three.js scene mounted imperatively ──────────────────────────────────────
function ThreeCanvas({ deployments, projects, accent, highlighted, onSelect, onHover }) {
  const mountRef = useRef()
  const [initError, setInitError] = useState(null)

  // Live values the animation loop needs without re-running the effect
  const hlRef       = useRef(highlighted)
  const onSelectRef = useRef(onSelect)
  const onHoverRef  = useRef(onHover)
  useEffect(() => { hlRef.current = highlighted }, [highlighted])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onHoverRef.current = onHover }, [onHover])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const H = 480
    let W = mount.clientWidth || 800

    let renderer, controls, raf

    try {
      // ── Renderer ──────────────────────────────────────────────────────────
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      mount.appendChild(renderer.domElement)

      // ── Scene & camera ────────────────────────────────────────────────────
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#030308')
      const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 500)
      camera.position.set(0, 5, 12)

      // ── Orbit controls ────────────────────────────────────────────────────
      controls = new OrbitControls(camera, renderer.domElement)
      controls.autoRotate      = true
      controls.autoRotateSpeed = 0.4
      controls.enablePan       = false
      controls.minDistance     = 4
      controls.maxDistance     = 18

      // ── Lights ────────────────────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0xffffff, 0.15))
      const l1 = new THREE.PointLight(0x8090c0, 0.6); l1.position.set(10, 8, 10);  scene.add(l1)
      const l2 = new THREE.PointLight(0x4050a0, 0.3); l2.position.set(-10, -4, -10); scene.add(l2)

      // Collect all geometries + materials for disposal on unmount
      const toDispose = []

      // ── Stars ─────────────────────────────────────────────────────────────
      const starPos = new Float32Array(2500 * 3)
      for (let i = 0; i < 2500; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi2  = Math.acos(2 * Math.random() - 1)
        const r     = 80 + Math.random() * 50
        starPos[i*3]   = r * Math.sin(phi2) * Math.cos(theta)
        starPos[i*3+1] = r * Math.sin(phi2) * Math.sin(theta)
        starPos[i*3+2] = r * Math.cos(phi2)
      }
      const sGeo = new THREE.BufferGeometry()
      sGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      const sMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.5 })
      toDispose.push(sGeo, sMat)
      scene.add(new THREE.Points(sGeo, sMat))

      // ── Grid ──────────────────────────────────────────────────────────────
      const grid = new THREE.GridHelper(24, 24, 0x0d0d20, 0x070715)
      grid.position.y = -2.8
      scene.add(grid)

      // ── Layout helpers ────────────────────────────────────────────────────
      const accentCol = new THREE.Color(accent || '#c9a84c')

      const projPos = projects.length === 0 ? [] :
        projects.length === 1 ? [new THREE.Vector3(0, 0, 0)] :
        projects.map((_, i) => {
          const a = (i / projects.length) * Math.PI * 2
          return new THREE.Vector3(Math.cos(a) * 3.8, 0, Math.sin(a) * 3.8)
        })

      const byProject = {}
      projects.forEach(p => { byProject[p.name] = [] })
      deployments.forEach(d => {
        if (byProject[d.name] !== undefined) byProject[d.name].push(d)
        else { const k = Object.keys(byProject)[0]; if (k) byProject[k].push(d) }
      })

      // ── Scene objects ─────────────────────────────────────────────────────
      const projMeshes  = []  // {mesh} — rotated in loop
      const deployNodes = []  // {mesh, ring, dep, pulsing}

      const addLine = (p1, p2, col, op) => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(
          new Float32Array([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z]), 3,
        ))
        const m = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })
        toDispose.push(g, m)
        scene.add(new THREE.Line(g, m))
      }

      const buildDeploys = (deps, center) => {
        const positions = spiralPositions(deps.length, center.x, center.z)
        deps.forEach((dep, i) => {
          const dpos  = positions[i] || new THREE.Vector3(center.x + 2, 0, center.z)
          const col   = new THREE.Color(STATE_COLOR[dep.state] || '#3a3a4a')
          const isHL  = hlRef.current === dep.uid

          addLine(center, dpos, isHL ? accentCol : new THREE.Color('#1a2233'), isHL ? 0.85 : 0.28)

          const dg = new THREE.SphereGeometry(0.18, 16, 12)
          const dm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 })
          const sphere = new THREE.Mesh(dg, dm)
          sphere.position.copy(dpos)
          toDispose.push(dg, dm)
          scene.add(sphere)

          const rg = new THREE.TorusGeometry(0.3, 0.02, 8, 32)
          const rm = new THREE.MeshStandardMaterial({ color: accentCol, emissive: accentCol, emissiveIntensity: 1.5 })
          const ring = new THREE.Mesh(rg, rm)
          ring.rotation.x = Math.PI / 2
          ring.position.copy(dpos)
          ring.visible = isHL
          toDispose.push(rg, rm)
          scene.add(ring)

          deployNodes.push({ mesh: sphere, ring, dep, pulsing: dep.state === 'BUILDING' || dep.state === 'QUEUED' })
        })
      }

      projects.forEach((project, pi) => {
        const ppos = projPos[pi] || new THREE.Vector3(0, 0, 0)

        const g1 = new THREE.IcosahedronGeometry(0.55, 1)
        const m1 = new THREE.MeshStandardMaterial({ color: accentCol, emissive: accentCol, emissiveIntensity: 0.55, wireframe: true })
        const ico = new THREE.Mesh(g1, m1)
        ico.position.copy(ppos)
        toDispose.push(g1, m1)
        scene.add(ico)
        projMeshes.push(ico)

        const g2 = new THREE.IcosahedronGeometry(0.7, 1)
        const m2 = new THREE.MeshStandardMaterial({ color: accentCol, emissive: accentCol, emissiveIntensity: 0.12, wireframe: true, transparent: true, opacity: 0.25 })
        const ico2 = new THREE.Mesh(g2, m2)
        ico2.position.copy(ppos)
        toDispose.push(g2, m2)
        scene.add(ico2)

        const pl = new THREE.PointLight(accentCol, 3, 5, 2)
        pl.position.copy(ppos)
        scene.add(pl)

        buildDeploys(byProject[project.name] || [], ppos)
      })

      if (projects.length === 0 && deployments.length > 0) {
        buildDeploys(deployments, new THREE.Vector3(0, 0, 0))
      }

      // ── Raycasting ────────────────────────────────────────────────────────
      const raycaster = new THREE.Raycaster()
      const mouse     = new THREE.Vector2(-9999, -9999)
      let   hoveredDep  = null
      let   hoveredMesh = null

      const onMouseMove = (e) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      }
      const onClick = () => { if (hoveredDep) onSelectRef.current?.(hoveredDep) }
      renderer.domElement.addEventListener('mousemove', onMouseMove)
      renderer.domElement.addEventListener('click', onClick)

      // ── Animation loop ────────────────────────────────────────────────────
      const clock = new THREE.Clock()

      const animate = () => {
        raf = requestAnimationFrame(animate)
        const dt = clock.getDelta()
        const t  = clock.elapsedTime
        const hl = hlRef.current

        projMeshes.forEach(m => { m.rotation.y += dt * 0.35 })

        deployNodes.forEach(({ mesh, ring, dep, pulsing }) => {
          const isHL  = hl === dep.uid
          const isHov = mesh === hoveredMesh
          mesh.scale.setScalar(isHL || isHov ? 1.5 : pulsing ? 1 + Math.sin(t * 4) * 0.2 : 1)
          mesh.material.emissiveIntensity = isHL ? 1.2 : pulsing ? 0.4 + Math.sin(t * 4) * 0.35 : isHov ? 0.7 : 0.25
          ring.visible    = isHL
          ring.rotation.z += dt * 1.2
        })

        // Hover detection via raycasting
        raycaster.setFromCamera(mouse, camera)
        const hits = raycaster.intersectObjects(deployNodes.map(d => d.mesh))
        if (hits.length > 0) {
          const hit = deployNodes.find(d => d.mesh === hits[0].object)
          if (hit && hit.dep !== hoveredDep) {
            hoveredDep  = hit.dep
            hoveredMesh = hit.mesh
            onHoverRef.current?.(hoveredDep)
            renderer.domElement.style.cursor = 'pointer'
          }
        } else if (hoveredDep) {
          hoveredDep  = null
          hoveredMesh = null
          onHoverRef.current?.(null)
          renderer.domElement.style.cursor = ''
        }

        controls.update()
        renderer.render(scene, camera)
      }
      animate()

      // ── Resize observer ───────────────────────────────────────────────────
      const ro = new ResizeObserver(() => {
        W = mount.clientWidth
        camera.aspect = W / H
        camera.updateProjectionMatrix()
        renderer.setSize(W, H)
      })
      ro.observe(mount)

      return () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
        renderer.domElement.removeEventListener('mousemove', onMouseMove)
        renderer.domElement.removeEventListener('click', onClick)
        controls.dispose()
        toDispose.forEach(d => { try { d.dispose() } catch { /* ignore */ } })
        renderer.dispose()
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      }
    } catch (err) {
      console.error('[VercelScene3D setup]', err)
      setInitError(err.message || 'Unknown error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (initError) {
    return (
      <div style={styles.fallback}>
        <span style={styles.fallbackText}>3D scene failed to initialise</span>
        <span style={{ color: 'rgba(140,130,120,0.4)', fontFamily: 'monospace', fontSize: 10 }}>{initError}</span>
      </div>
    )
  }

  return <div ref={mountRef} style={{ width: '100%', height: 480, borderRadius: 10, overflow: 'hidden' }} />
}

// ── Public component with tooltip overlay ────────────────────────────────────
export default function VercelScene3D({ deployments = [], projects = [], accent, highlighted, onSelect }) {
  const [hoveredDep, setHoveredDep] = useState(null)
  const col = hoveredDep ? (STATE_COLOR[hoveredDep.state] || '#3a3a4a') : null

  return (
    <Scene3DErrorBoundary>
      <div style={{ position: 'relative', width: '100%', height: 480 }}>
        <ThreeCanvas
          deployments={deployments}
          projects={projects}
          accent={accent}
          highlighted={highlighted}
          onSelect={onSelect}
          onHover={setHoveredDep}
        />

        {hoveredDep && (
          <div style={{ position: 'absolute', top: 12, right: 16, pointerEvents: 'none', background: 'rgba(3,3,12,0.92)', border: `1px solid ${col}99`, borderRadius: 4, padding: '6px 12px', zIndex: 10, fontFamily: '"Raleway", sans-serif', fontSize: 11, color: '#d8d0c8', backdropFilter: 'blur(10px)', boxShadow: `0 0 12px ${col}44` }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{hoveredDep.name}</div>
            <div style={{ color: col, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{hoveredDep.state}</div>
            {hoveredDep.target === 'production' && (
              <div style={{ color: '#c9a84c', fontSize: 9, letterSpacing: '0.12em', marginTop: 2 }}>PRODUCTION</div>
            )}
            {hoveredDep.meta?.branch && (
              <div style={{ color: '#666', fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>{hoveredDep.meta.branch}</div>
            )}
          </div>
        )}
      </div>
    </Scene3DErrorBoundary>
  )
}

const styles = {
  fallback: {
    width: '100%', height: 480, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#030308', borderRadius: 10, gap: 12,
  },
  fallbackText: {
    color: 'rgba(180,80,80,0.7)', fontFamily: '"Raleway", sans-serif',
    fontSize: 13, letterSpacing: '0.06em',
  },
  retryBtn: {
    background: 'transparent', border: '1px solid rgba(201,168,76,0.4)',
    color: 'rgba(201,168,76,0.7)', fontFamily: '"Raleway", sans-serif',
    fontSize: 11, letterSpacing: '0.1em', padding: '4px 14px',
    cursor: 'pointer', borderRadius: 2,
  },
}
