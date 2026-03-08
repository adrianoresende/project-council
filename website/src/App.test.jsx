import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders required landing page sections', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /why use llm council/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /^pricing$/i })).toBeInTheDocument()
})

test('renders core pricing content', () => {
  render(<App />)
  expect(screen.getByText('Starter')).toBeInTheDocument()
  expect(screen.getByText('Pro Council')).toBeInTheDocument()
  expect(screen.getByText('$0')).toBeInTheDocument()
  expect(screen.getByText('$99')).toBeInTheDocument()
})
