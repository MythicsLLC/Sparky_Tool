export default function KPICards({ kpis }) {
  const numeric = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      {numeric.map(([col, stats]) => (
        <div key={col} style={{ background: '#fff', borderRadius: 8, padding: '1rem', minWidth: 160, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#0055aa' }}>{col}</h3>
          <p>Count: {stats.count}</p>
          <p>Sum: {stats.sum.toFixed(2)}</p>
          <p>Avg: {stats.mean.toFixed(2)}</p>
          <p>Min: {stats.min.toFixed(2)}</p>
          <p>Max: {stats.max.toFixed(2)}</p>
        </div>
      ))}
    </div>
  )
}
