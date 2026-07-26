/**
 * The HTTP status carried by a thrown fetch error, if it carries one.
 *
 * The absence of a status is itself meaningful: it means nothing answered — the
 * request never reached a server that could have a verdict. Callers that
 * distinguish "the answer is no" from "there is no answer" (issue #164) depend on
 * that difference, so this deliberately returns `undefined` rather than a
 * stand-in code.
 */
export function statusOf(error: unknown): number | undefined {
  return (error as { status?: number })?.status
}

/** Whether [error] is a fetch failure the server answered with `404`. */
export function isNotFound(error: unknown): boolean {
  return statusOf(error) === 404
}
