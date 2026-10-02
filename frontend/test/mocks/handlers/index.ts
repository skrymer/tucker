import { checkHandlers } from './check'
import { foodHandlers } from './foods'
import { goalHandlers } from './goal'
import { identityHandlers } from './identity'
import { intakeBreakdownHandlers } from './intake-breakdown'
import { micronutrientHandlers } from './micronutrients'
import { profileHandlers } from './profile'
import { referenceFoodHandlers } from './reference-foods'
import { reviewHandlers } from './reviews'
import { summaryHandlers } from './summary'
import { tagHandlers } from './tags'
import { weightHandlers } from './weight'
import { weightTimelineHandlers } from './weight-timeline'

/**
 * The baseline every opted-in test inherits: a neutral, consistent User —
 * set up, counting calories, weighed in once, no Goal, an empty catalog and
 * no Tags, nothing logged today or this week, one Weekly Review (the first,
 * which set the Budget), too few readings for a Weight Timeline, and no
 * Reference Food matching anything. A test `use()`s only the variation it is
 * about (ADR 0034).
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
  ...reviewHandlers,
  ...intakeBreakdownHandlers,
  ...micronutrientHandlers,
  ...weightTimelineHandlers,
]
