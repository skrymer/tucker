import { checkHandlers } from './check'
import { profileHandlers } from './profile'
import { summaryHandlers } from './summary'

/**
 * The baseline every opted-in test inherits: a neutral, consistent account —
 * set up, counting calories, nothing logged today. A test `use()`s only the
 * variation it is about (ADR 0034).
 */
export const handlers = [
  ...profileHandlers,
  ...summaryHandlers,
  ...checkHandlers,
]
