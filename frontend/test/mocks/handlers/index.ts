import { checkHandlers } from './check'
import { goalHandlers } from './goal'
import { profileHandlers } from './profile'
import { summaryHandlers } from './summary'
import { weightHandlers } from './weight'

/**
 * The baseline every opted-in test inherits: a neutral, consistent account —
 * set up, counting calories, weighed in, no Goal, nothing logged today. A test
 * `use()`s only the variation it is about (ADR 0034).
 */
export const handlers = [
  ...profileHandlers,
  ...summaryHandlers,
  ...weightHandlers,
  ...goalHandlers,
  ...checkHandlers,
]
