import { beforeEach, describe, expect, it } from 'vitest'

import { MockLabApi } from '../api/MockLabApi'
import { loadPreferences, loadRecentReports, savePreferences, saveRecentReport } from './persistence'

describe('IndexedDB workspace persistence', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('tinylsm-lab-ui')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  })

  it('persists preferences and bounds local reports', async () => {
    await savePreferences({ activeSection: 'storage', eventFilter: 'wal', statePanelCollapsed: true })
    expect(await loadPreferences()).toEqual({ activeSection: 'storage', eventFilter: 'wal', statePanelCollapsed: true })
    const report = await new MockLabApi().exportReport()
    for (let index = 0; index < 10; index += 1)
      await saveRecentReport({ ...report, exportedAt: `2026-09-04T09:00:${index.toString().padStart(2, '0')}.000Z` })
    expect(await loadRecentReports()).toHaveLength(8)
  })
})
