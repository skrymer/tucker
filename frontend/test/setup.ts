import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/vue'

// Testing Library only auto-cleans when vitest globals are on; do it explicitly.
afterEach(() => {
  cleanup()
})
