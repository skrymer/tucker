import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/vue'
import { installMswServer } from './mocks/node'

// Testing Library only auto-cleans when vitest globals are on; do it explicitly.
afterEach(() => {
  cleanup()
})

// `/api` is answered by the shared MSW baseline in every file (ADR 0034).
installMswServer()
