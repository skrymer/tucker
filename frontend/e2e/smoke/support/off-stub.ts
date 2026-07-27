/**
 * The TypeScript half of the Open Food Facts stub's contract. The other half is
 * `../fixtures/off-stub.conf` (the nginx responder) and the recorded payloads in
 * `../fixtures/off-stub/`; the reasoning lives in `../fixtures/off-stub/README.md`.
 *
 * These live here rather than in each spec so there is exactly one pair to keep
 * in step — this module and the conf — instead of one copy per smoke.
 */

/**
 * Refused with a `503` by the stub, so a smoke can drive a genuine **Inconclusive
 * Lookup** ([#164](https://github.com/skrymer/tucker/issues/164)) through the real
 * chain. Not a product and never will be: keep it out of every fixture, and keep
 * it in step with `off-stub.conf`.
 */
export const UNREACHABLE_BARCODE = '5030000000503'

/**
 * The console guard fails a smoke on any failed request, so a test that
 * *deliberately* induces the 503 above has to say so. Scope this to the block
 * that induces it — a 503 leaking into a path that should have missed is the
 * bug #164 fixed, and the rest of the suite must stay strict about it.
 */
export const INDUCED_503_NOISE = [/Failed to load resource: .*status of 503/]
