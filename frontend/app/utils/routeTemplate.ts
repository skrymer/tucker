/**
 * The page a router path names, in its file's own spelling (`/foods/[id]`): the
 * one form of a route a metric may carry (ADR 0038), since it holds no id.
 */
export function routeTemplate(matchedPath: string): string {
  return matchedPath.replace(/:(\w+)\([^)]*\)/g, '[$1]')
}
