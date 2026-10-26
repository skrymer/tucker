# An Admin sees how Tucker performs, and nothing of any User

The metrics of [ADR 0038](0038-performance-is-measured-by-tucker-itself-and-no-metric-names-a-user.md)
are read on an admin page, so Tucker gains its first role. An **Admin** is a User who
may also see how Tucker performs: its pages' timings and its server's health. The role
grants **nothing else**. It does not reach another User's Foods, Entries, weights or
any other owned row, and [ADR 0021](0021-every-row-is-owned-by-one-user.md)'s "nothing
is shared" holds for every one of them. Widening the role later means revising this
ADR, not adding an endpoint.

## Decision

- **An operator makes an Admin**, by listing the email address in Tucker's
  configuration (`TUCKER_ADMIN_EMAILS`), the same way an operator admits a User
  ([ADR 0020](0020-identity-comes-from-cloudflare-access.md)). The backend grants
  `ROLE_ADMIN` when it reads the principal, and an empty list means no Admins. Nobody
  becomes an Admin from inside Tucker.
- **`GET /api/me` says whether the caller is an Admin** (`admin: true|false`), and the
  page shows its desktop-only "Admin" item from that. The backend is the gate. The
  field only decides what is drawn.
- **Tucker's own metrics are read through `/api/admin/metrics`**, which answers a
  non-Admin **404**, as ADR 0021 answers a foreign id.
- **The server's own figures come from Spring Boot Actuator, exposed as Actuator
  serves them**, at `/api/actuator`, behind `ROLE_ADMIN` through Spring Security's
  `EndpointRequest` matcher. Each figure the page wants is then configuration, not a
  hand-written endpoint that grows with every new figure.
  - **The exposure is an allowlist, `health` and `prometheus`**, with percentiles
    published for `http.server.requests`. The page reads every meter in one
    `prometheus` scrape, Micrometer's registry rendered as text on request, with no
    Prometheus server and nothing stored. `metrics` is left out: it lists a tag's
    values but not which go together, so a per-endpoint chart over it took a read per
    endpoint per figure, around 130 requests a page load. `env`, `configprops`, `heapdump`,
    `threaddump` and `loggers` are **never** exposed: they leak configuration and
    secrets, or, for `loggers`, change the running server. Adding to the allowlist
    is a security decision, made here. The exposed endpoints are in the OpenAPI
    spec (`springdoc.show-actuator`), so the committed snapshot pins the allowlist:
    widening it fails the build until the spec change is committed, and review sees
    it. It also types the two paths for the client and the shared mocks like any
    other.
  - **The percentiles run since the last start, one series per endpoint.** Their
    expiry is set past any uptime, since Micrometer's default two-minute window would
    put a recent figure beside cumulative counts. `http.server.requests` drops its
    `status`, `exception` and `error` tags, because a percentile is one series per full tag
    set and cannot be summed across them. An endpoint is then `method + uri`,
    with `outcome` left to split successes from 5xx. Actuator's own reads and the
    buckets Spring files an unanswered request under (`/**`, `UNKNOWN`) are not
    recorded at all. Actuator serves the rest unshaped, so the page mirrors two rules
    the backend's own percentiles hold — fewer than five successes reads "too few",
    and the slowest is listed first — and a change to either is made in both.
  - **A non-Admin gets 404 here too**, through the same refusal as
    `/api/admin/**`, so ADR 0021's rule holds without exception. A refusal of a
    missing CSRF token stays 403, on every path alike. For an Admin, an endpoint
    outside the allowlist is 404 because Actuator never maps it, so to a non-Admin
    "not exposed" and "not allowed" read the same.
  - **Actuator's figures run since the last start.** They reset on every restart and
    deploy, the page says so, and the page's filters do not apply to them. Keeping
    their history would need a metrics store, which is out of scope.

## Scope: an operator's tool, beside the User's app

The Admin page is a tool for looking after Tucker, not part of the diet tracker a
User uses. It reads figures about Tucker — timings, the server's health — and no
domain at all. So only the ADRs about how Tucker is built, secured and hosted govern
it; those about the User's product do not.

- **Govern the Admin surface:** [0004](0004-compose-inline-composables.md) (inline
  composables), [0007](0007-async-in-flight-state.md) (in-flight states),
  [0012](0012-single-node-self-hosting.md) and
  [0015](0015-production-deployment-topology.md) (hosting),
  [0013](0013-test-coverage-policy.md) (test coverage),
  [0020](0020-identity-comes-from-cloudflare-access.md),
  [0021](0021-every-row-is-owned-by-one-user.md) and
  [0025](0025-a-mutation-must-prove-it-came-from-tuckers-own-page.md) (identity,
  ownership, CSRF), [0023](0023-absence-on-the-wire-is-an-explicit-null.md) (explicit
  null), [0034](0034-api-mocks-are-one-msw-handler-set-and-tests-assert-what-the-user-sees.md)
  (MSW), [0036](0036-an-aggregate-has-its-identity-from-creation.md) (identity from
  creation), [0038](0038-performance-is-measured-by-tucker-itself-and-no-metric-names-a-user.md)
  and this one.
- **Do not:** [0001](0001-domain-driven-design.md) and
  [0002](0002-business-logic-belongs-in-the-backend.md) — the page holds no domain
  rule, so shaping operational figures in the client (the five-success "too few", the
  slowest-first order) is presentation, not a rule the backend owns;
  [0005](0005-notifications-persistent-errors-quiet-success.md) (the page mutates
  nothing); [0009](0009-responsive-pwa-over-native-app.md),
  [0011](0011-supported-platforms.md) and
  [0017](0017-phone-overlays-are-reka-dialog-bottom-sheets.md) — it is desktop-only,
  a phone shows a notice; [0014](0014-client-owns-today.md) (no calendar day); and
  every ADR about the diet domain.

A new Admin feature checks itself against the first list, and widening the second is
revising this ADR.

## Considered options

- **An `is_admin` column on `user`.** It would need a migration, and something to set
  it: the backend image has no `sqlite3` to flip it on the host, and setting it from
  inside Tucker needs an Admin who makes Admins.
- **A Cloudflare Access group claim.** Access's one-time-PIN sign-in carries no groups
  without extra identity-provider setup, and it would tie the role to dashboard
  configuration.
- **A Tucker endpoint shaped for the page (`/api/admin/server`)**, reading the
  Micrometer registry and returning one typed DTO. It would give one request, a typed
  client and a 404, but every new figure would need a backend change, an OpenAPI
  regeneration and a client change. Actuator's own allowlist and role matcher are the
  framework's answer to exposing it safely.
- **Showing each User's metrics to the Admin.** Ruled out by ADR 0038: no metric
  names a User, so there is nothing to show.
- **A 403 at `/api/actuator`**, as this ADR first decided, on the grounds that a 404
  needed a hand-written handler in front of the framework and that `/actuator`
  existing is no secret. Once `/api/admin/**` had that handler (#521), joining it cost
  one matcher, and the 403 was an exception to ADR 0021 that bought nothing.
