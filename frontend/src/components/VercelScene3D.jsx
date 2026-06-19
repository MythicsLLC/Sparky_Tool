import { Component, useRef, useState, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// No @react-three/drei — its module-init code accesses undefined Three.js
// internals in three@0.184, crashing the entire chunk before any render.
// Everything here uses only @react-three/fiber + raw Three.js.

const STATE_COLOR = {
  READY:    '#6b8f71',
  ERROR:    '#b45050',
  BUILDING: '#c9a84c',
  QUEUED:   '#c9a84c',
  CANCELED: '#3a3a4a',
}

function spiralPositions(count, center = [0, 0, 0], minR = 1.4, maxR = 3.4) {
  if (count === 0) return []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const t     = count < 2 ? 0 : i / (count - 1)
    const r     = minR + t * (maxR - minR)
    const angle = goldenAngle * i
    const y     = Math.sin(i * 1.6) * 0.75
    return [center[0] + Math.cos(angle) * r, center[1] + y, center[2] + Math.sin(angle) * r]
  })
}

// ── Orbit controls wired up imperatively (no drei) ────────────────────────────
function Controls() {
  const { camera, gl } = useThree()
  const ref = useRef()
  useEffect(() => {
    const ctrl = new OrbitControls(camera, gl.domElement)
    ctrl.autoRotate      = true
    ctrl.autoRotateSpeed = 0.4
    ctrl.enablePan       = false
    ctrl.minDistance     = 4
    ctrl.maxDistance     = 18
    ref.current = ctrl
    return () => { ctrl.dispose(); ref.current = null }
  }, [camera, gl])
  useFrame(() => ref.current?.update())
  return null
}

// ── Star field (native Points geometry, no drei Stars) ────────────────────────
function StarField() {
  const positions = useMemo(() => {
    const count = 2500
    const arr   = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 80 + Math.random() * 50
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.15} sizeAttenuation transparent opacity={0.5} />
    </points>
  )
}

// ── Connection line (core Three.js primitives only) ───────────────────────────
function ConnectionLine({ start, end, color, opacity }) {
  const positions = useMemo(
    () => new Float32Array([start[0], start[1], start[2], end[0], end[1], end[2]]),
    [start[0], start[1], start[2], end[0], end[1], end[2]],
  )
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </line>
  )
}

// ── Project node ──────────────────────────────────────────────────────────────
function ProjectNode({ position, accent }) {
  const mesh = useRef()
  useFrame((_, dt) => { if (mesh.current) mesh.current.rotation.y += (dt || 0) * 0.35 })
  return (
    <group position={position}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} wireframe />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.12} wireframe transparent opacity={0.25} />
      </mesh>
      <pointLight color={accent} intensity={3} distance={5} decay={2} />
    </group>
  )
}

// ── Deployment node ───────────────────────────────────────────────────────────
function DeployNode({ position, dep, accent, isHighlighted, onHover, onClick }) {
  const mesh = useRef()
  const ring = useRef()
  const col     = STATE_COLOR[dep.state] || '#3a3a4a'
  const pulsing = dep.state === 'BUILDING' || dep.state === 'QUEUED'

  useFrame(({ clock }, dt) => {
    if (!mesh.current) return
    const delta = dt || 0
    const t = clock.getElapsedTime()
    mesh.current.scale.setScalar(
      isHighlighted ? 1.5
      : pulsing ? 1 + Math.sin(t * 4) * 0.2
      : 1
    )
    if (mesh.current.material) {
      mesh.current.material.emissiveIntensity =
        isHighlighted ? 1.2
        : pulsing ? 0.4 + Math.sin(t * 4) * 0.35
        : 0.25
    }
    if (ring.current) {
      ring.current.visible = isHighlighted
      ring.current.rotation.z += delta * 1.2
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={mesh}
        onPointerOver={(e) => { e.stopPropagation(); onHover(dep) }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onClick(dep) }}
      >
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.25} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.02, 8, 32]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>
    </group>
  )
}

// ── Inner scene (Canvas child) ────────────────────────────────────────────────
function SceneInner({ deployments, projects, accent, highlighted, onSelect, onHover }) {
  const byProject = useMemo(() => {
    const map = {}
    projects.forEach(p => { map[p.name] = [] })
    deployments.forEach(d => {
      if (map[d.name] !== undefined) {
        map[d.name].push(d)
      } else {
        const key = Object.keys(map)[0]
        if (key) map[key].push(d)
      }
    })
    return map
  }, [deployments, projects])

  const projPositions = useMemo(() => {
    if (projects.length === 0) return []
    if (projects.length === 1) return [[0, 0, 0]]
    return projects.map((_, i) => {
      const angle = (i / projects.length) * Math.PI * 2
      return [Math.cos(angle) * 3.8, 0, Math.sin(angle) * 3.8]
    })
  }, [projects])

  return (
    <>
      <color attach="background" args={['#030308']} />
      <ambientLight intensity={0.15} />
      <pointLight position={[10, 8, 10]} intensity={0.6} color="#8090c0" />
      <pointLight position={[-10, -4, -10]} intensity={0.3} color="#4050a0" />
      <StarField />
      <gridHelper args={[24, 24, '#0d0d20', '#070715']} position={[0, -2.8, 0]} />
      <Controls />

      {projects.map((project, pi) => {
        const ppos    = projPositions[pi] || [0, 0, 0]
        const deps    = byProject[project.name] || []
        const dposArr = spiralPositions(deps.length, ppos)
        return (
          <group key={project.id}>
            <ProjectNode position={ppos} accent={accent} />
            {deps.map((dep, di) => {
              const dpos = dposArr[di] || [ppos[0] + 2, 0, ppos[2]]
              const isHL = highlighted === dep.uid
              return (
                <group key={dep.uid}>
                  <ConnectionLine
                    start={ppos}
                    end={dpos}
                    color={isHL ? accent : '#1a2233'}
                    opacity={isHL ? 0.85 : 0.28}
                  />
                  <DeployNode
                    position={dpos}
                    dep={dep}
                    accent={accent}
                    isHighlighted={isHL}
                    onHover={onHover}
                    onClick={onSelect}
                  />
                </group>
              )
            })}
          </group>
        )
      })}

      {projects.length === 0 && deployments.length > 0 && (() => {
        const dposArr = spiralPositions(deployments.length, [0, 0, 0])
        return deployments.map((dep, di) => (
          <DeployNode
            key={dep.uid}
            position={dposArr[di] || [di, 0, 0]}
            dep={dep}
            accent={accent}
            isHighlighted={highlighted === dep.uid}
            onHover={onHover}
            onClick={onSelect}
          />
        ))
      })()}
    </>
  )
}

// ── Canvas error boundary ─────────────────────────────────────────────────────
class Scene3DErrorBoundary extends Component {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  componentDidCatch(err) { console.error('[VercelScene3D]', err) }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          width: '100%', height: 480, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#030308', borderRadius: 10, gap: 12,
        }}>
          <div style={{ color: 'rgba(180,80,80,0.7)', fontFamily: '"Raleway", sans-serif', fontSize: 13, letterSpacing: '0.06em' }}>
            3D scene failed to render
          </div>
          <button
            onClick={() => this.setState({ crashed: false })}
            style={{
              background: 'transparent', border: '1px solid rgba(201,168,76,0.4)',
              color: 'rgba(201,168,76,0.7)', fontFamily: '"Raleway", sans-serif',
              fontSize: 11, letterSpacing: '0.1em', padding: '4px 14px',
              cursor: 'pointer', borderRadius: 2,
            }}
          >
            RETRY
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Public component ──────────────────────────────────────────────────────────
export default function VercelScene3D({ deployments = [], projects = [], accent, highlighted, onSelect }) {
  const [hoveredDep, setHoveredDep] = useState(null)
  const col = hoveredDep ? (STATE_COLOR[hoveredDep.state] || '#3a3a4a') : null

  return (
    <Scene3DErrorBoundary>
      <div style={{ position: 'relative', width: '100%', height: 480 }}>
        <Canvas
          camera={{ position: [0, 5, 12], fov: 55 }}
          style={{ width: '100%', height: 480, borderRadius: 10, display: 'block' }}
          gl={{ antialias: true, alpha: false }}
        >
          <SceneInner
            deployments={deployments}
            projects={projects}
            accent={accent}
            highlighted={highlighted}
            onSelect={onSelect}
            onHover={setHoveredDep}
          />
        </Canvas>

        {/* Hover tooltip — plain DOM overlay, no drei Html needed */}
        {hoveredDep && (
          <div style={{
            position: 'absolute', top: 12, right: 16, pointerEvents: 'none',
            background: 'rgba(3,3,12,0.92)', border: `1px solid ${col}99`,
            borderRadius: 4, padding: '6px 12px', zIndex: 10,
            fontFamily: '"Raleway", sans-serif', fontSize: 11, color: '#d8d0c8',
            backdropFilter: 'blur(10px)', boxShadow: `0 0 12px ${col}44`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{hoveredDep.name}</div>
            <div style={{ color: col, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {hoveredDep.state}
            </div>
            {hoveredDep.target === 'production' && (
              <div style={{ color: '#c9a84c', fontSize: 9, letterSpacing: '0.12em', marginTop: 2 }}>PRODUCTION</div>
            )}
            {hoveredDep.meta?.branch && (
              <div style={{ color: '#666', fontSize: 9, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>
                {hoveredDep.meta.branch}
              </div>
            )}
          </div>
        )}
      </div>
    </Scene3DErrorBoundary>
  )
}
