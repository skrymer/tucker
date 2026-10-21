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
  - **The exposure is an allowlist, `health` and `metrics`**, with percentiles
    published for `http.server.requests`. `env`, `configprops`, `heapdump`,
    `threaddump` and `loggers` are **never** exposed: they leak configuration and
    secrets, or, for `loggers`, change the running server. Adding to the allowlist
    is a security decision, made here.
  - **A non-Admin gets 403 here, not 404**, the one stated exception to ADR 0021's
    rule: a 404 would need a hand-written handler in front of the framework, and that
    `/actuator` exists is no secret.
  - **Actuator's figures run since the last start.** They reset on every restart and
    deploy, the page says so, and the page's filters do not apply to them. Keeping
    their history would need a metrics store, which is out of scope.

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
