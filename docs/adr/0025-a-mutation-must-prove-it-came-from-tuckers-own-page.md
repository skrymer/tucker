# A mutation must prove it came from Tucker's own page

## Context

Cloudflare Access authenticates every request to `tucker-diet.com`, and the
backend verifies its work ([ADR 0020](0020-identity-comes-from-cloudflare-access.md)).
What the backend actually reads is the `Cf-Access-Jwt-Assertion` **header**, so
from Spring's own point of view Tucker is a stateless token API — the shape
Spring Security's documentation names when it says CSRF protection is not
needed. F10 slice 1 ([#155](https://github.com/skrymer/tucker/issues/155))
disabled it on exactly that reading.

The reading is wrong, and it is wrong one hop upstream where Spring cannot see.
Access's credential is the **`CF_Authorization` cookie**. A browser attaches a
cookie by itself, and Cloudflare mints the assertion header from it at the edge
regardless of who caused the request. That is ambient authority: a form on an
attacker's page produces a fully authenticated request.

Whether that is exploitable turns on one attribute, so it was measured rather
than assumed. On 2026-08-25, `CF_Authorization` on `tucker-diet.com` carries
**`SameSite=None`** — read from the real cookie in DevTools against a live
session. Cloudflare's documentation says the app-domain default is "None", but
the label alone could not settle it: the app-domain `CF_AppSession` cookie is
observably emitted with *no* `SameSite` attribute at all, and "no attribute"
means the browser applies `Lax` — the opposite outcome. Only the real cookie
distinguished the two.

Most mutators were already safe, and not by luck. They take a JSON
`@RequestBody`, and `application/json` is not a CORS-safelisted request
`Content-Type`, so a cross-site `<form>` provably cannot send it: the request
either arrives form-encoded and fails with 415, or it is preflighted, and the
preflight carries no cookie so Access redirects it. That is a specification
guarantee. It was also entirely unwritten, and one endpoint had opted out of it.

`POST /api/weekly-review` takes no body and declares no `consumes`, so a
cross-site form POST to it is a CORS-*simple* request — no preflight, cookie
attached. It runs a **Weekly Review**, which the domain documents as
irreversible and which sets the Calorie Budget and Protein Floor for the week
([#226](https://github.com/skrymer/tucker/issues/226)).

## Decision

Re-enable Spring Security's CSRF protection using the synchronizer-token pattern
its own documentation prescribes for a single-page application:
`CookieCsrfTokenRepository.withHttpOnlyFalse()` for the repository, and the
reference documentation's `SpaCsrfTokenRequestHandler` and `CsrfCookieFilter`
copied into the project. Every state-changing request — anything outside
`GET`/`HEAD`/`TRACE`/`OPTIONS` — must carry a token that matches the
`XSRF-TOKEN` cookie.

This is OWASP's first instruction ("check if your framework has built-in CSRF
protection and use it") satisfied by Spring's documented answer, rather than a
mechanism of our own.

The token is read **by JavaScript on the page** and sent as a header. That is
the whole of the defence and the reason it works: a cross-site page can cause a
request to Tucker but cannot read Tucker's cookies, so it cannot produce the
header.

Spring Security 6.4.2 (Spring Boot 3.4.1) has neither `csrf.spa()` nor a shipped
`SpaCsrfTokenRequestHandler` — both arrive in Spring Security 7 / Boot 4. Until
then the two classes are copied from the reference documentation verbatim, and
should be deleted in favour of `csrf { spa() }` on that upgrade.

## Two ways a stateless resource server breaks the stock configuration

Both were found by measurement against the running image, and both are silent —
the code reads as a correct copy of Spring's SPA sample in each case.

### The bearer-token exemption: turning CSRF on is not enough

`oauth2ResourceServer` registers a CSRF exemption for bearer-token requests of
its own accord, in `registerDefaultCsrfOverride`. With CSRF enabled the filter's
matcher reads:

```
And [ CsrfNotRequired [TRACE, HEAD, GET, OPTIONS],
      Not [ OAuth2ResourceServerConfigurer$BearerTokenRequestMatcher ] ]
```

Spring's reasoning is the same one this ADR opens by rejecting: a browser never
attaches a bearer token unprompted, so such a request cannot be forged. Tucker's
`bearerTokenResolver` reads `Cf-Access-Jwt-Assertion`, which Cloudflare *does*
attach unprompted — so the exemption matches **every request Tucker serves**, and
enabling CSRF protects nothing at all. This was measured, not reasoned about: the
first green implementation left the #226 attack returning `200` and a real Weekly
Review in the database.

That is the dangerous shape of this bug. A reviewer reads `csrf { … }` where
`csrf { disable() }` used to be and sees the fix; the endpoint is still open.

`ignoringRequestMatchers` is AND-ed into the matcher and cannot be cleared through
the DSL, and unlike the reactive side the servlet side does not suppress the
override when a custom `requireCsrfProtectionMatcher` is supplied
([spring-security#8668](https://github.com/spring-projects/spring-security/issues/8668),
open since June 2020, no milestone). So the matcher is restored on the built filter
through `CsrfConfigurer`'s own `addObjectPostProcessor` — a supported hook that
composes rather than replaces, and which `CsrfConfigurer.configure` invokes after it
sets the matcher and before it adds the filter. Not a bypass of the framework: the
framework's only seam for a decision it has no flag for.

`CsrfGateTest` is what keeps this honest, and it discriminates — removing the post
processor turns both its tests red, one naming the #226 attack and one listing every
endpoint that would mutate without proof.

### The token rotates itself away

Spring rotates the CSRF token whenever a request authenticates, so that one minted
before a login cannot be used after it. Tucker has no login boundary of its own —
Access owns that — and being `STATELESS` it authenticates afresh on **every**
request, safe methods included. So `CsrfAuthenticationStrategy` deletes the cookie
on each one and defers a replacement that nothing materialises before the response
is written. Measured against the running image, the cookie alternates:

```
GET  /api/version   ->  Set-Cookie: XSRF-TOKEN=<v>      jar: 1
GET  /api/foods     ->  Set-Cookie: XSRF-TOKEN=; Max-Age=0    jar: 0
GET  /api/foods     ->  Set-Cookie: XSRF-TOKEN=<w>      jar: 1
```

A client therefore holds a token roughly half the time, and the smokes failed on
the *second* mutation of each test while the first passed.

Materialising the replacement — moving `CsrfCookieFilter` past the authentication
filters, which is where Spring's sample puts it — fixes the symptom and leaves a
worse defect: every request would then mint a new token, so two in-flight requests
would read the same one and the first to land would invalidate the second. A SPA
issues overlapping requests constantly.

So the rotation is switched off with `NullAuthenticatedSessionStrategy`, and
`CsrfCookieFilter` stays next to `CsrfFilter` where it materialises the token for a
client that has only ever issued safe requests. The protection rotation buys is
against fixation across a login, and there is no login here to cross.

## Considered and rejected

**Make `run()` non-simple with `consumes`.** Either requiring
`application/json` or negating the three CORS-simple content types would close
this endpoint. Both were rejected for the same reason: they fix the one endpoint
that opted out of an incidental protection while leaving that protection
unwritten, so the next body-less POST reopens the hole silently and nothing
fails. The negated form additionally encodes the rule as a triple negative on a
single handler.

**A custom request header.** OWASP sanctions this for exactly Tucker's shape —
an API-driven client that never submits a `<form>` — and it is markedly smaller:
a static header, no token lifecycle, no server state. Rejected because its
soundness rests on Tucker having no permissive CORS policy. That is true today
and nothing states it, which is the same genus of unwritten load-bearing fact
that produced this bug.

**Fetch Metadata (`Sec-Fetch-Site`).** Refusing `Sec-Fetch-Site: cross-site`
covers the whole boundary with no client change at all, and every platform
[ADR 0011](0011-supported-platforms.md) supports sends the header. Rejected on
two counts. Spring Security has nothing for it — it is
[an open feature request](https://github.com/spring-projects/spring-security/issues/18361) —
so it is the hand-rolled option in a decision whose premise is not hand-rolling.
And OWASP sanctions it only with an `Origin`/`Referer` fallback, explicitly
warning "do not fail open" on an absent header; that fallback would need the
backend to know its own public origin, which behind the tunnel and the nitro
proxy it does not — its `Host` is `backend:8080` — so it would mean a new
undefaulted property in the `tucker.access.*` mould and a new boot-failure mode.

**`SameSite=Lax` on the Access cookie alone.** Cloudflare's own recommendation
for `CF_Authorization`, and zero code. Rejected as a *replacement* — OWASP files
`SameSite` as defence-in-depth explicitly not to be relied on alone, and it is
configuration outside this repository that no suite can test and one dashboard
click can undo. It is worth doing **as well**, as a separate, independently
revertible step once tokens are live, so that a broken sign-in has only one
possible cause — tracked as
[#258](https://github.com/skrymer/tucker/issues/258).

## Consequences

- **The nitro proxy must never inject the header.** `server/routes/api/[...].ts`
  sees the `XSRF-TOKEN` cookie on every proxied request and could add
  `X-XSRF-TOKEN` from it. That would look like a tidy fix and would silently
  reopen the hole in full: the attacker's form POST travels through that same
  proxy carrying that same cookie, and the proxy would complete the attack for
  them. The token has to be read by page JavaScript or it proves nothing.
- **No `ignoringRequestMatchers` exemption**, including for `/api/test/**`. A
  smoke-only bypass is the shape #155 refused for authentication, and the test
  clients carry a token the same way every other client does.
- **A stale or missing token surfaces as a 403 and recovers on Retry.**
  `CsrfCookieFilter` renders a fresh cookie on every response including the 403,
  so ADR 0005's persistent error toast with Retry succeeds on the next press. No
  automatic retry is added: it would mask a security refusal as intermittent
  slowness, and it is the implicit-retry behaviour
  [ADR 0007](0007-async-in-flight-state.md) and
  [#182](https://github.com/skrymer/tucker/issues/182) deliberately removed.
- **Existing call sites are largely untouched**, because each client already
  funnels through one place: the backend's ~180 MockMvc calls ride the
  `MockMvcBuilderCustomizer` that #155 introduced for signing in, the smokes'
  157 mutating calls ride the `request` and `otherUser` fixtures, and the SPA
  rides one `openFetch:onRequest:api` hook beside the auth gate's.
- **The `XSRF-TOKEN` cookie is `SameSite=Strict`, and not `Secure` — which is a known
  gap, not a free choice.** Strict costs nothing: the token is only ever read by Tucker's
  own page and replayed to Tucker's own origin, so nothing off-site needs to send it.

  `Secure` is the interesting one, and the first version of this ADR got it wrong. It
  claimed `CookieCsrfTokenRepository` derives the flag from `request.isSecure()` — which
  is only the *fallback*: `saveToken` uses `secure != null ? secure : request.isSecure()`,
  so an explicit `it.secure(true)` is honoured whatever scheme the backend sees. The
  cookie could therefore carry `Secure` today, behind the tunnel, unchanged.

  What it costs is the test clients. Every one of them speaks plain HTTP, and Java's
  `CookieManager` will not return a `Secure` cookie over an `http` URI, so the
  Testcontainers e2e would send a header with no matching cookie and be refused by the
  gate it exists to prove.

  The exposure this leaves is real and worth naming rather than waving through: an
  attacker who can write a cookie for a sibling host over plain HTTP — hostile Wi-Fi, no
  HSTS on that name — can *overwrite* this one, and a double-submit check believes
  whatever the cookie says. `Secure` is precisely the flag that refuses that write. It is
  not closed here because closing it properly means forwarding the scheme
  (`server.forward-headers-strategy`) so dev and the suites stay coherent, which is
  [#258](https://github.com/skrymer/tucker/issues/258)'s work.
- **`GET /api/version` is unaffected** — it is a safe method, so it stays
  reachable without a token, and an operator can still tell "the app is down"
  from "the app is rejecting me". A *`POST`* to it is now refused, which
  cost the e2e probe for "an error on an open door reports its own status": it
  deliberately carries no assertion, and was tripping the same-origin rule instead.
  It carries a token now, so it still tests the gate it names.
- **The test suites carry a real token rather than a test double.**
  `SecurityMockMvcRequestPostProcessors.csrf()` reaches into the shared filter and
  swaps `CsrfTokenRepository` for its own, so the suite would stop exercising the
  repository production runs — the same objection ADR 0020 raised against a
  verification-skipping principal. Instead every client takes the cookie Tucker
  hands out and sends it back: the MockMvc customizer through the repository bean,
  the Testcontainers e2e and the Playwright fixtures over the wire.
