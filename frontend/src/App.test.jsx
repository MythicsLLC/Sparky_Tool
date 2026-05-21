import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import * as api from './api'

// recharts uses ResizeObserver which jsdom doesn't support — mock the whole module
vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, Legend: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null, Cell: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

test('renders Run Engine button', () => {
  render(<App />)
  expect(screen.getByText('Run Engine')).toBeInTheDocument()
})

test('disables button and shows loading text while running', async () => {
  vi.spyOn(api, 'runEngine').mockImplementation(() => new Promise(() => {}))
  render(<App />)
  fireEvent.click(screen.getByText('Run Engine'))
  expect(screen.getByText('Running...')).toBeInTheDocument()
  expect(screen.getByRole('button')).toBeDisabled()
})

test('shows error banner on failure', async () => {
  vi.spyOn(api, 'runEngine').mockRejectedValue({
    response: { data: { detail: 'PeopleSoft error: 502' } }
  })
  render(<App />)
  fireEvent.click(screen.getByText('Run Engine'))
  await waitFor(() => expect(screen.getByText('PeopleSoft error: 502')).toBeInTheDocument())
})

test('renders dashboard sections on success', async () => {
  vi.spyOn(api, 'runEngine').mockResolvedValue({
    data: {
      row_count: 1,
      columns: ['name', 'age'],
      rows: [{ name: 'Alice', age: 30 }],
      kpis: {
        age: { type: 'numeric', count: 1, sum: 30, mean: 30, min: 30, max: 30 },
        name: { type: 'categorical', count: 1, unique_count: 1, value_counts: { Alice: 1 } }
      }
    }
  })
  render(<App />)
  fireEvent.click(screen.getByText('Run Engine'))
  await waitFor(() => expect(screen.getByText('KPIs')).toBeInTheDocument())
  expect(screen.getByText('Charts')).toBeInTheDocument()
  expect(screen.getByText(/Data \(1 rows\)/)).toBeInTheDocument()
})
