import { checkHandlers } from './check'
import { foodHandlers } from './foods'
import { goalHandlers } from './goal'
import { identityHandlers } from './identity'
import { profileHandlers } from './profile'
import { referenceFoodHandlers } from './reference-foods'
import { summaryHandlers } from './summary'
import { tagHandlers } from './tags'
import { weightHandlers } from './weight'

/**
 * The baseline every opted-in test inherits: a neutral, consistent User —
 * set up, counting calories, weighed in, no Goal, an empty catalog and no
 * Tags, nothing logged today, and a food database that matches nothing. A
 * test `use()`s only the variation it is about (ADR 0034).
 */
export const handlers = [
  ...identityHandlers,
  ...profileHandlers,
  ...summaryHandlers,
  ...weightHandlers,
  ...goalHandlers,
  ...foodHandlers,
  ...tagHandlers,
  ...referenceFoodHandlers,
  ...checkHandlers,
]
