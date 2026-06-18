import { useRef, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, OrbitControls, Html, Line } from '@react-three/drei'

const STATE_COLOR = {
  READY:    '#6b8f71',
  ERROR:    '#b45050',
  BUILDING: '#c9a84c',
  QUEUED:   '#c9a84c',
  CANCELED: '#3a3a4a',
}

// Fibonacci spiral layout in XZ plane with slight Y variation
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

// ── Project node (wireframe icosahedron, slowly self-rotating) ────────────────
function ProjectNode({ position, accent }) {
  const mesh = useRef()
  useFrame((_, dt) => { if (mesh.current) mesh.current.rotation.y += dt * 0.35 })
  return (
    <group position={position}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} wireframe />
      </mesh>
      {/* outer glow halo */}
      <mesh>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.12} wireframe transparent opacity={0.25} />
      </mesh>
      <pointLight color={accent} intensity={3} distance={5} decay={2} />
    </group>
  )
}

// ── Deployment node (sphere, pulsing if building, highlight ring if selected) ──
function DeployNode({ position, dep, accent, isHighlighted, onHover, onClick }) {
  const mesh = useRef()
  const ring = useRef()
  const [hovered, setHovered] = useState(false)
  const col     = STATE_COLOR[dep.state] || '#3a3a4a'
  const pulsing = dep.state === 'BUILDING' || dep.state === 'QUEUED'

  useFrame(({ clock }, dt) => {
    if (!mesh.current) return
    const t = clock.getElapsedTime()
    mesh.current.scale.setScalar(
      hovered || isHighlighted ? 1.5
      : pulsing ? 1 + Math.sin(t * 4) * 0.2
      : 1
    )
    if (mesh.current.material) {
      mesh.current.material.emissiveIntensity =
        isHighlighted ? 1.2
        : pulsing ? 0.4 + Math.sin(t * 4) * 0.35
        : hovered ? 0.7
        : 0.25
    }
    if (ring.current) {
      ring.current.visible = isHighlighted
      ring.current.rotation.z += dt * 1.2
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={mesh}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(dep) }}
        onPointerOut={() => { setHovered(false); onHover(null) }}
        onClick={(e) => { e.stopPropagation(); onClick(dep) }}
      >
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.25} />
      </mesh>

      {/* Spinning highlight ring */}
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.02, 8, 32]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>

      {/* HTML tooltip */}
      {(hovered || isHighlighted) && (
        <Html center distanceFactor={10} position={[0, 0.42, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(3, 3, 12, 0.92)',
            border: `1px solid ${col}99`,
            borderRadius: 4,
            padding: '5px 10px',
            fontFamily: '"Raleway", sans-serif',
            fontSize: 11,
            color: '#d8d0c8',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(10px)',
            boxShadow: `0 0 12px ${col}44`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{dep.name}</div>
            <div style={{ color: col, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{dep.state}</div>
            {dep.target === 'production' && (
              <div style={{ color: '#c9a84c', fontSize: 9, letterSpacing: '0.12em', marginTop: 2 }}>PRODUCTION</div>
            )}
            {dep.meta?.branch && (
              <div style={{ color: '#666', fontSize: 9, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>
                {dep.meta.branch}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Label floating above project node ─────────────────────────────────────────
function ProjectLabel({ position, name }) {
  return (
    <Html center position={[position[0], position[1] + 0.9, position[2]]} distanceFactor={12} style={{ pointerEvents: 'none' }}>
      <div style={{
        fontFamily: '"Raleway", sans-serif',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(220,200,160,0.7)',
        whiteSpace: 'nowrap',
        textShadow: '0 0 8px rgba(201,168,76,0.5)',
      }}>
        {name}
      </div>
    </Html>
  )
}

// ── Inner scene — must be a child of <Canvas> to use useFrame ─────────────────
function SceneInner({ deployments, projects, accent, highlighted, onSelect }) {
  const [, setHoveredDep] = useState(null)

  // Group deployments by their project name (Vercel deployment.name === project.name)
  const byProject = useMemo(() => {
    const map = {}
    projects.forEach(p => { map[p.name] = [] })
    deployments.forEach(d => {
      if (map[d.name] !== undefined) {
        map[d.name].push(d)
      } else {
        // fallback: assign to first project cluster
        const key = Object.keys(map)[0]
        if (key) map[key].push(d)
      }
    })
    return map
  }, [deployments, projects])

  // Position projects: single → center, multiple → polygon
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
      <Stars radius={80} depth={50} count={2500} factor={3} saturation={0} fade speed={0.3} />
      <gridHelper args={[24, 24, '#0d0d20', '#070715']} position={[0, -2.8, 0]} />
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.4}
        enablePan={false}
        minDistance={4}
        maxDistance={18}
        makeDefault
      />

      {projects.map((project, pi) => {
        const ppos  = projPositions[pi] || [0, 0, 0]
        const deps  = byProject[project.name] || []
        const dposArr = spiralPositions(deps.length, ppos)

        return (
          <group key={project.id}>
            <ProjectNode position={ppos} accent={accent} />
            <ProjectLabel position={ppos} name={project.name} />

            {deps.map((dep, di) => {
              const dpos  = dposArr[di] || [ppos[0] + 2, 0, ppos[2]]
              const isHL  = highlighted === dep.uid
              const lCol  = isHL ? accent : '#1a2233'

              return (
                <group key={dep.uid}>
                  <Line
                    points={[ppos, dpos]}
                    color={lCol}
                    lineWidth={isHL ? 1.5 : 0.5}
                    transparent
                    opacity={isHL ? 0.85 : 0.28}
                  />
                  <DeployNode
                    position={dpos}
                    dep={dep}
                    accent={accent}
                    isHighlighted={isHL}
                    onHover={setHoveredDep}
                    onClick={onSelect}
                  />
                </group>
              )
            })}
          </group>
        )
      })}

      {/* Fallback when no projects returned but deployments exist */}
      {projects.length === 0 && deployments.length > 0 && (() => {
        const dposArr = spiralPositions(deployments.length, [0, 0, 0])
        return deployments.map((dep, di) => (
          <DeployNode
            key={dep.uid}
            position={dposArr[di] || [di, 0, 0]}
            dep={dep}
            accent={accent}
            isHighlighted={highlighted === dep.uid}
            onHover={setHoveredDep}
            onClick={onSelect}
          />
        ))
      })()}
    </>
  )
}

// ── Public component — wraps the Canvas ───────────────────────────────────────
export default function VercelScene3D({ deployments, projects, accent, highlighted, onSelect }) {
  return (
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
      />
    </Canvas>
  )
}
