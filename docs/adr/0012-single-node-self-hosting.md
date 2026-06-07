# Single-node self-hosting on a VPS (greenfield first deploy)

Until F6, hosting was recorded only informally in `CLAUDE.md` (a Docker container
behind a Cloudflare Tunnel, with Litestream backup), and the originally-imagined home
was an Intel N100 mini-PC. F6 forced the question into the open: the **Weekly-Review
Reminder** needs an *always-on* process to send pushes
([ADR 0010](0010-minimal-scheduler-for-the-weekly-reminder.md)), and the VAPID signing
key needs a home — both of which depend on where and how Tucker runs. Tucker is also
single-user today but built to grow multi-user, which raises "shouldn't this be in the
cloud?" This ADR records the hosting choice and the constraints that pin it.

**Update (F6 deployment):** the mini-PC was never actually stood up — Tucker's first
production deployment is **greenfield onto a cheap VPS**. So the VPS is the *current*
host, not a future "next step"; the mini-PC remains a viable fallback but is not in
use. The single-node architecture below is unchanged either way.

## Decision

**Stay single-node, and keep the architecture that implies.** Tucker runs as one
process with a local SQLite file on a persistent disk, accessed via jOOQ and
replicated off-host by Litestream. This is a deliberate **single-writer, single-node**
design — it rules out scale-to-zero serverless and multi-instance platforms unless
the database is re-platformed.

- **Current: a cheap VPS** (e.g. Hetzner / DigitalOcean + Docker), Litestream to
  S3/R2. Rented always-on hardware with a real IP, behind a Cloudflare Tunnel with
  Cloudflare Access for auth. The reminder cron "just works" because the box never
  sleeps. The specific provider is the operator's pick and has no architectural impact
  — any Docker-capable VPS works. The deployment topology that runs *on* it is
  [ADR 0015](0015-production-deployment-topology.md).
- **Fallback: the Beelink N100 mini-PC.** Already built, free, always-on (it also runs
  a NAS and Jellyfin). The originally-imagined home; still a valid place to run the
  identical stack if the VPS is ever dropped. Same architecture, same container.
- **VAPID keypair self-bootstraps into the SQLite DB.** Generated on first boot if
  absent, stored as application config in the database — *no external secret store*.
  It rides along in the Litestream backup and works **unchanged** on the mini-PC and
  on a VPS, so this choice decouples the reminder feature from the hosting step.

## Alternatives rejected

- **Fly.io** — an excellent SQLite/Litestream-native PaaS and a fine alternative to a
  VPS. Rejected only as the *default next step* in favour of a plain VPS, which is the
  operator's preference; Fly remains a reasonable substitute if the VPS route sours.
- **Re-platform the DB (Turso/libSQL or Postgres) onto a stateless/serverless host** —
  the only path to true multi-instance scale, but it *reverses* the SQLite/Litestream
  decision, **breaks the always-on-cron assumption** (serverless scale-to-zero can't
  run [ADR 0010](0010-minimal-scheduler-for-the-weekly-reminder.md)'s sender without
  bolting on an external scheduler), and adds moving parts no current requirement
  justifies. Deferred until genuine scale, not aspiration, demands it.
- **An external/managed secret store for VAPID** — disproportionate for a single
  operator behind Cloudflare Access; self-bootstrapping in the DB is simpler and
  portable.

## Consequences

- **The always-on, single-writer assumption is load-bearing** — the reminder
  scheduler ([ADR 0010](0010-minimal-scheduler-for-the-weekly-reminder.md)) relies on
  it. A move that breaks it (serverless) must revisit that ADR too.
- **Secrets ride in the backup.** The VAPID private key lives in the Litestream-
  replicated DB; protecting that backup protects the key. Accepted for this threat
  model (single operator, Cloudflare Access in front).
- **Multi-user is a scope question, not yet a hosting one.** A handful of users fit on
  one node fine; what multi-user really forces is *app-level auth* (Cloudflare Access
  gates a fixed set of identities today) — a separate future increment, not this ADR.
- **Any host move stays low-friction by construction:** same container, same
  SQLite+Litestream, self-bootstrapping key. The first deploy is greenfield (no data to
  migrate); a later VPS↔mini-PC↔Fly move is a Litestream restore + `compose up`, no code
  change.

## References

- [`CLAUDE.md`](../../CLAUDE.md) — Architecture (SQLite/jOOQ, Litestream, Cloudflare
  Tunnel + Access).
- [0010 — minimal scheduler for the weekly reminder](0010-minimal-scheduler-for-the-weekly-reminder.md)
  — the always-on dependency and the self-bootstrapping VAPID key.
- [0015 — production deployment topology](0015-production-deployment-topology.md) — how
  the frontend, backend, and tunnel are wired on the host.
</content>
