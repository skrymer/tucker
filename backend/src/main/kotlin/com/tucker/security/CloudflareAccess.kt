package com.tucker.security

// What Cloudflare Access puts on the wire, named in one place: the filter chain resolves
// the token from the header, the decoder checks the claim, and the tests mint both.
//
// Access does not speak OAuth 2 to the origin — it forwards a signed JWT under its own
// header rather than `Authorization: Bearer` — which is the whole reason the filter chain
// hands Spring's `HeaderBearerTokenResolver` a header name instead of taking the stock
// `DefaultBearerTokenResolver`.

/** The header Cloudflare Access signs its assertion into. */
const val ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion"

/** The claim it names the authenticated person in. */
const val EMAIL_CLAIM = "email"
