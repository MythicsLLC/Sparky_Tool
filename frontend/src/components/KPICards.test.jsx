import { render, screen } from '@testing-library/react'
import KPICards from './KPICards'

const kpis = {
  age: { type: 'numeric', count: 3, sum: 90, mean: 30, min: 25, max: 35 },
  name: { type: 'categorical', count: 3, unique_count: 3, value_counts: { Alice: 1 } }
}

test('renders a card for each numeric column', () => {
  render(<KPICards kpis={kpis} />)
  expect(screen.getByText('age')).toBeInTheDocument()
})

test('shows count, sum, avg, min, max for numeric columns', () => {
  render(<KPICards kpis={kpis} />)
  expect(screen.getByText('Count: 3')).toBeInTheDocument()
  expect(screen.getByText('Sum: 90.00')).toBeInTheDocument()
  expect(screen.getByText('Avg: 30.00')).toBeInTheDocument()
  expect(screen.getByText('Min: 25.00')).toBeInTheDocument()
  expect(screen.getByText('Max: 35.00')).toBeInTheDocument()
})

test('does not render categorical columns as KPI cards', () => {
  render(<KPICards kpis={kpis} />)
  expect(screen.queryByText('name')).not.toBeInTheDocument()
})
