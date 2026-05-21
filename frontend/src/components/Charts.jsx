import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export default function Charts({ kpis }) {
  const numeric = Object.entries(kpis).filter(([, v]) => v.type === 'numeric')
  const categorical = Object.entries(kpis).filter(([, v]) => v.type === 'categorical')

  const barData = numeric.map(([col, s]) => ({
    name: col,
    mean: parseFloat(s.mean.toFixed(2)),
    min: parseFloat(s.min.toFixed(2)),
    max: parseFloat(s.max.toFixed(2)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {barData.length > 0 && (
        <div>
          <h3>Numeric Summary</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="mean" fill="#0088FE" />
              <Bar dataKey="min" fill="#00C49F" />
              <Bar dataKey="max" fill="#FFBB28" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {categorical.map(([col, stats]) => {
        const pieData = Object.entries(stats.value_counts).map(([name, value]) => ({ name, value }))
        return (
          <div key={col}>
            <h3>{col} Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" label>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}
