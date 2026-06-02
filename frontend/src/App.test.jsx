import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, beforeEach, afterEach } from 'vitest'
import App from './App'
import * as api from './api'

vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null, Cell: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

// Pass the health check immediately in all tests unless a test overrides it
beforeEach(() => {
  vi.spyOn(api, 'checkHealth').mockResolvedValue({ data: { status: 'ok' } })
  // Dashboard data hooks — return empty lists by default
  vi.spyOn(api, 'listConfigs').mockResolvedValue({ data: [] })
  vi.spyOn(api, 'listRuns').mockResolvedValue({ data: { items: [] } })
  vi.spyOn(api, 'listRunOutputs').mockResolvedValue({ data: { items: [] } })
  vi.spyOn(api, 'runConfig').mockResolvedValue({ data: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Startup screen ────────────────────────────────────────────────────────────

test('shows startup screen while health check is pending', () => {
  vi.spyOn(api, 'checkHealth').mockImplementation(() => new Promise(() => {}))
  render(<App />)
  expect(screen.getByText('Connecting to backend…')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /run engine/i })).not.toBeInTheDocument()
})

test('shows error state when all health check attempts fail', async () => {
  vi.useFakeTimers()
  vi.spyOn(api, 'checkHealth').mockRejectedValue(new Error('network error'))
  render(<App />)
  await act(async () => { await vi.runAllTimersAsync() })
  expect(screen.getByText(/Cannot reach the backend/i)).toBeInTheDocument()
})

test('renders main UI after health check passes', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByRole('button', { name: /run engine/i })).toBeInTheDocument())
})

// ── Main app ──────────────────────────────────────────────────────────────────

test('disables button and shows loading text while running', async () => {
  vi.spyOn(api, 'runConfig').mockImplementation(() => new Promise(() => {}))
  render(<App />)
  await waitFor(() => screen.getByRole('button', { name: /run/i }))
  fireEvent.click(screen.getByRole('button', { name: /run/i }))
  expect(screen.getByText(/running/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /running/i, hidden: true })).toBeDisabled()
})

test('shows error banner on run failure', async () => {
  vi.spyOn(api, 'runConfig').mockRejectedValue({
    response: { data: { detail: 'PeopleSoft error: 502' } },
  })
  render(<App />)
  await waitFor(() => screen.getByRole('button', { name: /run/i }))
  fireEvent.click(screen.getByRole('button', { name: /run/i }))
  await waitFor(() => expect(screen.getByText('PeopleSoft error: 502')).toBeInTheDocument())
})

test('renders dashboard sections on success', async () => {
  vi.spyOn(api, 'runConfig').mockResolvedValue({
    data: {
      row_count: 1,
      columns: ['name', 'age'],
      rows: [{ name: 'Alice', age: 30 }],
      kpis: {
        age:  { type: 'numeric',      count: 1, sum: 30, mean: 30, min: 30, max: 30 },
        name: { type: 'categorical',  count: 1, unique_count: 1, value_counts: { Alice: 1 } },
      },
    },
  })
  render(<App />)
  await waitFor(() => screen.getByRole('button', { name: /run/i }))
  fireEvent.click(screen.getByRole('button', { name: /run/i }))
  await waitFor(() => expect(screen.getByText('KPIs')).toBeInTheDocument())
  expect(screen.getByText('Charts')).toBeInTheDocument()
  expect(screen.getByText(/Data \(1 rows\)/)).toBeInTheDocument()
})
