import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

import Charts from './Charts'

const kpis = {
  age: { type: 'numeric', count: 3, sum: 90, mean: 30, min: 25, max: 35 },
  dept: { type: 'categorical', count: 3, unique_count: 2, value_counts: { HR: 2, IT: 1 } }
}

test('renders bar chart for numeric columns', () => {
  render(<Charts kpis={kpis} />)
  expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
})

test('renders pie chart for categorical columns', () => {
  render(<Charts kpis={kpis} />)
  expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
})

test('shows categorical column name as section heading', () => {
  render(<Charts kpis={kpis} />)
  expect(screen.getByText('dept Distribution')).toBeInTheDocument()
})
