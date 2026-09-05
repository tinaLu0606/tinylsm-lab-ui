import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from './App'
import { LabProvider } from './state/LabContext'

describe('TinyLSM Lab', () => {
  it('opens a mock session, executes a write, and exposes every workspace', async () => {
    const user = userEvent.setup()
    render(<LabProvider><App /></LabProvider>)
    await user.click(await screen.findByRole('button', { name: /Open mock session/ }))
    const runPut = screen.getByRole('button', { name: 'Run put' })
    await waitFor(() => expect(runPut).toBeEnabled())
    await user.click(runPut)
    expect((await screen.findAllByText('Value stored')).length).toBeGreaterThan(0)

    for (const page of ['Storage', 'Timeline', 'Workload', 'Recovery', 'Reports']) {
      await user.click(screen.getByRole('button', { name: new RegExp(page) }))
      expect(screen.getByRole('main')).toBeInTheDocument()
    }
  })
})
