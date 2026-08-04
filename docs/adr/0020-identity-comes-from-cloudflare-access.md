# Identity comes from Cloudflare Access, verified in the backend

Tucker has been single-user in the strongest sense: there is no identity anywhere in
the schema, and the backend never learns who is calling. Cloudflare Access gates the
whole origin ([ADR 0015](0015-production-deployment-topology.md)) and that has been the
*entire* auth story — the app behind it simply assumes one human.
[ADR 0012](0012-single-node-self-hosting.md) predicted the bill: "what multi-user really
forces is *app-level auth* … a separate future increment." This is that increment.

The constraint that shapes it: Tucker is invite-only today (a handful of people admitted
by the Access policy), but **public self-signup is a plausible future**. The design must
not weld the domain to Cloudflare, and it must not build a login product nobody has asked
for yet.

## Decision

**Cloudflare Access stays the authenticator; the backend verifies its assertion and owns
the User.** Tucker never stores a credential, sends a verification email, or renders a
login screen.

- **Admission is the Access policy.** Adding someone's email there is what "inviting a
  user" means. There is no second allowlist inside Tucker.
- **The backend verifies the signed `Cf-Access-Jwt-Assertion` itself**, via Spring
  Security's OAuth2 resource server: `NimbusJwtDecoder` against the team JWKS, and Spring's
  stock `HeaderBearerTokenResolver` pointed at Cloudflare's header instead of
  `Authorization: Bearer`. Four things are then checked, not two — issuer and timestamps,
  the application's audience, that the assertion **names a person**, and that it carries an
  `exp` at all. The last two are admission decisions worth stating: a Cloudflare *service*
  token authenticates a machine and carries `common_name` where a person's carries `email`,
  so it is refused; and the stock timestamp validator only checks `exp` when present, so
  requiring it is what stops a token that never expires. The assertion is *signed*, so
  its trustworthiness does not depend on Cloudflare stripping client-supplied headers,
  nor on the backend never being reachable directly.
- **A `JwtAuthenticationConverter` maps the verified JWT to a `TuckerPrincipal(userId,
  email)`** and is the single home of **just-in-time provisioning**: a verified email
  matching no `user` row inserts one and proceeds. New users land on the existing
  first-run empty state (`SetupBanner`).
- **`user(id, email UNIQUE)` — a surrogate key.** Every owned table references `user.id`;
  the email is a mutable attribute matched at request time. Nothing outside the converter
  knows an email exists. Going public later means adding credentials or a second issuer
  keyed on the *same* row, not re-keying the database.
- **One verification path in every environment.** Non-production points the same decoder
  at a static local JWK set. **No application code can mint a token**: Kotlin tests mint
  in-process, Playwright smokes mint with `jose` and set `extraHTTPHeaders` (so switching
  identity is one line and cross-user isolation is genuinely testable), and `pnpm dev`
  attaches a pre-minted `TUCKER_DEV_ACCESS_TOKEN` produced by a committed script — a
  static string, not a signing capability.
- **Two paths stay unauthenticated**: `/v3/api-docs/**`, or `./gradlew generateOpenApiDocs`
  (which boots the app to regenerate the frontend's typed client) breaks; and
  `/api/version`, so an operator can tell "the app is down" from "the app is rejecting
  me". Swagger UI at `/docs` is deliberately *not* one of them — a browser cannot attach
  the assertion itself, so it is gated and therefore unbrowsable; the raw spec is the door
  that matters.

  Two *paths*, and additionally the servlet **ERROR dispatch** — matched on the dispatcher
  type, not on `/error`, so it stays a container-internal forward rather than becoming a
  third door. Spring Security filters that dispatch as well as the request, so without it
  an error *on an open path* is re-authorized and comes back 401, turning "the app is up,
  you asked wrongly" into "the app is rejecting me" — the exact distinction `/api/version`
  exists to make. It grants nothing on its own: an unauthenticated request to a gated path
  is refused by the entry point, which sets the status directly and never dispatches. Only
  a real socket can observe this — MockMvc records `sendError` and stops — so the proof is
  an e2e test rather than a unit one.
- **Self-service email change is out of scope.** Changing an email is an operator step
  (update the Access policy, then the row). When it is wanted, the intended design is
  *pending-email adoption*: the new address is parked in `pending_email`, and the first
  verified login with it adopts the existing account — so the Tucker-side and
  Access-side changes can happen in either order without creating a ghost account, and
  Access authenticating the new address *is* the verification.

## Alternatives rejected

- **Trust the forwarded `Cf-Access-Authenticated-User-Email` header.** Free, zero
  dependencies — and it bets the entire authorization boundary on Cloudflare overwriting
  client-supplied `Cf-` headers plus the backend never being reachable directly. One
  stray `ports:` entry turns it into unauthenticated impersonation of any user.
- **Tucker owns auth (magic link, OIDC, or passwords).** The right answer *if* Tucker goes
  public, and wrong now: it means email deliverability, session management, reset flows,
  and a login UI, to admit three people who are already admitted. The surrogate-key
  decision above is what keeps this cheap later.
- **Verify at the Nitro proxy and forward a trusted internal header.** Keeps crypto out of
  Kotlin, but splits the security boundary across two services and leaves the backend
  defenceless against anything else that ever talks to it.
- **A profile-gated dev resolver that skips JWT verification outside production.**
  Markedly cheaper — one bean, no token minting in four test layers. Rejected deliberately:
  auth is the most security-sensitive code in the project, and this would leave its real
  path with *no* automated coverage, exercised for the first time in production.
- **An explicit allowlist inside Tucker instead of JIT provisioning.** Means adding every
  person in two places and inventing an "authenticated but not enabled" wall for the times
  you forget the second one.

## Consequences

- **A misconfigured deploy locks everyone out.** A wrong issuer, `aud`, or JWKS URI 401s
  every request; recovery is redeploying the previous image, and `/api/version` stays open
  so "down" is distinguishable from "rejecting me". Tolerable while Tucker is still in
  development — worth a pre-flight against a real `CF_Authorization` cookie once the data
  behind the gate is genuinely precious.
- **Every backend test that touches HTTP now mints a token**, and repository/service tests
  that call beans directly need a `SecurityContext` (`spring-security-test`'s
  `@WithMockUser` or manual setup). That is ~23 Spring test classes.
- **The Access policy is load-bearing.** Because provisioning is JIT, widening the policy
  (a domain rule, a bypass) silently grants Tucker accounts. Acceptable while it is a
  hand-listed set of emails; it is the first thing to revisit before going public.
- **A runtime dependency on Cloudflare's JWKS endpoint.** Nimbus caches and refreshes on
  an unknown `kid`, but a cold start with no egress fails its first requests.
- `ReminderScheduler` runs on a cron thread with **no** SecurityContext — see
  [ADR 0021](0021-every-row-is-owned-by-one-user.md) for how it acts on behalf of users.

## References

- [`CONTEXT.md`](../../CONTEXT.md) — **User** (invited, never self-registered; owns
  everything).
- [0012 — single-node self-hosting](0012-single-node-self-hosting.md) — "multi-user forces
  app-level auth", the increment deferred there.
- [0015 — production deployment topology](0015-production-deployment-topology.md) — the
  one-origin Access app, the `/api` proxy that forwards headers verbatim, and the
  in-app detection of an expired Access session.
- [0021 — every row is owned by exactly one User](0021-every-row-is-owned-by-one-user.md)
  — what the principal established here is then used for.
