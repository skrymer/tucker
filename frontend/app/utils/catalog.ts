/**
 * The catalog, arriving with its Add sheet open — where the **Log** destination
 * sends a User whose catalog is empty (ADR 0028), since Log picks from what
 * exists and never creates a Food.
 *
 * One symbol rather than the query spelled out at both ends, so the agreement
 * between the link and the page that reads it is executable (as `exits.ts` makes
 * the service worker's).
 */
export const CATALOG_ADD_ROUTE = '/foods?add=1'

/** Whether a route's query asks the catalog to open its Add sheet on arrival. */
export function opensAddSheet(query: Record<string, unknown>): boolean {
  return query.add === '1'
}
