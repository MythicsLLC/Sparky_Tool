import { useState } from 'react'
import { runEngine } from './api'
import KPICards from './components/KPICards'
import Charts from './components/Charts'
import DataTable from './components/DataTable'
import './App.css'

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await runEngine()
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Unexpected error — check the console.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Sparky Tool</h1>
        <button className="run-button" onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : 'Run Engine'}
        </button>
      </header>

      {loading && <div className="spinner">Waiting for PeopleSoft engine to complete...</div>}
      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          <section>
            <h2>KPIs</h2>
            <KPICards kpis={data.kpis} />
          </section>
          <section>
            <h2>Charts</h2>
            <Charts kpis={data.kpis} />
          </section>
          <section>
            <h2>Data ({data.row_count} rows)</h2>
            <DataTable rows={data.rows} columns={data.columns} />
          </section>
        </>
      )}
    </div>
  )
}
