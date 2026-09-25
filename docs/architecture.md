# Architecture

Tucker's architecture as [C4](https://c4model.com) diagrams, drawn in Mermaid so
GitHub renders them in place. One diagram per level, zoom in going down: the
system in its world (Level 1), the deployable pieces inside it (Level 2), and the
components inside the pieces that carry the interesting behaviour (Level 3).

Level 1 and the deployment view use Mermaid's native
[C4 syntax](https://mermaid.js.org/syntax/c4.html). Levels 2 and 3 use a
C4-styled `flowchart`, because Mermaid's C4 renderer has no automatic layout:
it places elements in rows by statement order, and with two boundaries and
twelve elements its relationships cut straight through the shapes. The notation
changes; the abstraction level does not. The colours follow C4's convention:

| Colour | Meaning |
| --- | --- |
| Dark blue | A person, or Tucker itself |
| Light blue | A Tucker container or component |
| Grey | Something outside Tucker — or, at Level 3, outside the container being zoomed into |
| Dashed box | A boundary: where things run, or which container they belong to |

The domain words used here — Entry, Food, Weekly Review, Calorie Budget — are
defined in [`CONTEXT.md`](../CONTEXT.md); the reasons behind the shapes are in
[`docs/adr/`](adr/).

## Level 1 — System context

Who uses Tucker and what it depends on. Tucker holds no credentials of its own:
Cloudflare Access is the only sign-in, and its policy is the invitation list
([ADR 0020](adr/0020-identity-comes-from-cloudflare-access.md)).

```mermaid
C4Context
  title System context — Tucker

  Person(user, "User", "Logs food and weight; admitted by invitation. Owns every row they create — nothing is shared.")
  System_Ext(cloudflare, "Cloudflare", "Access (sign-in, signed assertion) and Tunnel (the only way in).")
  Person(operator, "Operator", "Admits Users in the Access policy; deploys and restores Tucker.")

  System_Ext(off, "Open Food Facts", "Product nutrition by barcode.")
  System(tucker, "Tucker", "Personal diet tracker: calories and protein against an adaptive Calorie Budget and Protein Floor.")
  System_Ext(push, "Web Push services", "FCM, Apple and Mozilla; deliver reminders to the User's devices.")

  System_Ext(r2, "Cloudflare R2", "Off-host copy of the database.")

  Rel_R(user, cloudflare, "Uses Tucker through", "HTTPS")
  Rel_L(operator, cloudflare, "Admits Users in", "Zero Trust")
  Rel_D(cloudflare, tucker, "Forwards signed-in requests", "Tunnel")
  Rel_L(tucker, off, "Looks up barcodes", "JSON/HTTPS")
  Rel_R(tucker, push, "Sends reminders", "Web Push/VAPID")
  Rel_D(tucker, r2, "Replicates database", "S3 API")

  UpdateRelStyle(user, cloudflare, $offsetX="-50", $offsetY="-45")
  UpdateRelStyle(operator, cloudflare, $offsetX="-60", $offsetY="-45")
  UpdateRelStyle(tucker, off, $offsetX="-45", $offsetY="-50")
  UpdateRelStyle(tucker, push, $offsetX="-45", $offsetY="-50")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Level 2 — Containers

The deployable and runtime pieces. The browser only ever talks to one origin: the
frontend's nitro server serves the SPA and proxies `/api` to the backend, so the
backend is never exposed ([ADR 0015](adr/0015-production-deployment-topology.md)).

```mermaid
flowchart TB
  user(["<b>User</b><br/>[Person]<br/>On a phone (installed PWA) or a desktop browser"]):::person

  subgraph browser["User's browser"]
    spa["<b>Single-page app</b><br/>[Container: Nuxt 4, Vue, Nuxt UI]<br/>Every screen; scans barcodes on-device with zxing-wasm"]:::container
    sw["<b>Service worker</b><br/>[Container: Workbox]<br/>Precaches the app shell; shows push notifications"]:::container
  end

  cf["<b>Cloudflare edge</b><br/>[Software System]<br/>Access verifies the User; Tunnel carries the request"]:::ext

  subgraph vps["Tucker VPS — Docker Compose"]
    tunnel["<b>cloudflared</b><br/>[Container: Cloudflare Tunnel]<br/>Outbound-only connector; no open ports"]:::container
    web["<b>Frontend server</b><br/>[Container: Nitro, Node]<br/>Serves the SPA; proxies /api to the backend"]:::container
    api["<b>Backend API</b><br/>[Container: Kotlin, Spring Boot]<br/>Domain model, weekly review, REST API, reminder cron"]:::container
    db[("<b>Database</b><br/>[Container: SQLite WAL, jOOQ, Flyway]<br/>One file; every row owned by one User")]:::container
    litestream["<b>Litestream</b><br/>[Container: Litestream]<br/>Streams the WAL off-host"]:::container
  end

  off["<b>Open Food Facts</b><br/>[Software System]<br/>Barcode nutrition"]:::ext
  push["<b>Web Push services</b><br/>[Software System]<br/>FCM, Apple, Mozilla"]:::ext
  r2["<b>Cloudflare R2</b><br/>[Software System]<br/>Backup bucket"]:::ext

  user -- "Uses" --> spa
  spa -- "Calls /api<br/>[JSON/HTTPS]" --> cf
  cf -- "Forwards with signed assertion<br/>[Tunnel]" --> tunnel
  tunnel -- "Forwards to<br/>[HTTP]" --> web
  web -- "Proxies /api to<br/>[JSON/HTTP]" --> api
  api -- "Reads and writes<br/>[JDBC]" --> db
  db -- "WAL tailed by" --> litestream
  litestream -- "Replicates to<br/>[S3 API]" --> r2
  api -- "Looks up barcodes<br/>[JSON/HTTPS]" --> off
  api -- "Sends reminders<br/>[Web Push/VAPID]" --> push
  sw -- "Receives reminders from<br/>[Web Push]" --> push

  classDef person fill:#08427b,color:#fff,stroke:#052e56
  classDef container fill:#438dd5,color:#fff,stroke:#2e6295
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
  style browser fill:none,stroke:#666,stroke-dasharray:5 5
  style vps fill:none,stroke:#666,stroke-dasharray:5 5
```

### Deployment

How the containers reach the box. Nothing builds on the VPS: CI publishes both
images to GHCR only for a commit whose suites were green, and
`deploy/update.sh` pulls the tag `deploy/version.sh` computes for that commit
(see [`deploy/README.md`](../deploy/README.md)).

```mermaid
C4Deployment
  title Deployment — Tucker in production

  Person(operator, "Operator", "Deploys a commit that CI has published.")

  Deployment_Node(github, "GitHub", "SaaS") {
    Container(ci, "CI", "GitHub Actions", "Runs the four suites; publishes both images only when they are green.")
    ContainerDb(ghcr, "GHCR", "Container registry", "tucker-backend and tucker-frontend, tagged version, SHA and latest.")
  }

  Deployment_Node(vps, "Brisbane VPS", "1 vCPU / 2 GB, Docker Compose + prod overlay") {
    Container(update, "deploy/update.sh", "bash", "Pulls the tag deploy/version.sh computes for the commit.")
    Container(stack, "Tucker stack", "Docker containers", "cloudflared, frontend, backend, litestream — each resource-limited.")
    ContainerDb(vol, "tucker-data", "Docker volume", "The SQLite file.")
  }

  Rel(ci, ghcr, "Pushes images to")
  Rel(operator, update, "Runs", "SSH")
  Rel(update, ghcr, "Pulls the commit's tag from", "HTTPS")
  Rel(update, stack, "Recreates")
  Rel(stack, vol, "Mounts")

  UpdateRelStyle(ci, ghcr, $offsetX="-45", $offsetY="-40")
  UpdateRelStyle(update, ghcr, $offsetX="-90", $offsetY="30")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

## Level 3 — Components

One diagram per area worth zooming into. Each shows the components of one
container that take part in one flow, not the whole container.

### Backend: the request path

Every `/api` request passes the same layers. The backend verifies the Access
assertion itself rather than trusting the edge, resolves it to a User
(provisioning one on first sight), and repositories scope every query to that
User from the security context — no repository signature carries an owner
([ADR 0021](adr/0021-every-row-is-owned-by-one-user.md)). Behaviour lives in the
domain model, not in the services
([ADR 0001](adr/0001-domain-driven-design.md)).

```mermaid
flowchart TD
  web["<b>Frontend server</b><br/>[Container: Nitro]"]:::ext

  subgraph api["Backend API — Spring Boot"]
    direction TB
    subgraph sec["Security — com.tucker.security"]
      jwt["<b>AccessJwtDecoder</b><br/>[Component: Nimbus, Cloudflare JWKS]<br/>verifies the assertion"]:::component
      principal["<b>AccessPrincipalConverter</b><br/>[Component: Spring Security]<br/>assertion → User, provisioned just-in-time"]:::component
      csrf["<b>SpaCsrf</b><br/>[Component: Spring Security]<br/>XSRF-TOKEN on every mutation"]:::component
    end
    current["<b>CurrentUser</b><br/>[Component: com.tucker.security]<br/>whose request this is, from the SecurityContext"]:::component
    controllers["<b>Controllers</b><br/>[Component: com.tucker.api, springdoc]<br/>REST endpoints + OpenAPI spec"]:::component
    services["<b>Services</b><br/>[Component: com.tucker.service]<br/>orchestrate a use case"]:::component
    domain["<b>Domain model</b><br/>[Component: com.tucker.domain]<br/>entities, value objects, rules"]:::component
    repos["<b>Repositories</b><br/>[Component: com.tucker.persistence, jOOQ]<br/>SQL scoped to the current User"]:::component
  end
  db[("<b>Database</b><br/>[Container: SQLite, Flyway]")]:::ext

  web -- "JSON/HTTP + Cf-Access-Jwt-Assertion" --> jwt
  jwt --> principal
  principal --> csrf
  csrf --> controllers
  controllers --> services
  controllers -- "simple reads" --> repos
  services --> domain
  services --> repos
  repos -- "reads owner from" --> current
  repos -- "JDBC" --> db

  classDef component fill:#85bbf0,color:#000,stroke:#5d82a8
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
  style api fill:none,stroke:#666,stroke-dasharray:5 5
  style sec fill:none,stroke:#666,stroke-dasharray:5 5
```

### Backend: the adaptive Weekly Review

How the Calorie Budget and Protein Floor come to be. The engine is lazy — a
review is run when something reads the summary and one is due — plus a forced
recompute whenever a Goal or the Calorie Tracking setting changes. There is no
LLM anywhere in it: the math is deterministic.

```mermaid
flowchart LR
  subgraph triggers["Triggers"]
    summary["<b>SummaryController</b><br/>[Component: REST controller]<br/>GET /api/summary: catch up if due"]:::component
    goal["<b>GoalService</b><br/>[Component: Spring service]<br/>start, switch or replace a Goal: force recompute"]:::component
    profile["<b>ProfileService</b><br/>[Component: Spring service]<br/>Calorie Tracking toggled: force recompute"]:::component
  end

  engine["<b>WeeklyReviewService</b><br/>[Component: Spring service]<br/>runs a review for a date"]:::component

  subgraph rules["Domain rules"]
    trend["<b>WeightTrend</b><br/>smoothed Trend Weight"]:::component
    maint["<b>Maintenance</b><br/>formula seed, then corrected from intake"]:::component
    targets["<b>IntakeTargets</b><br/>Budget + Protein Floor, only when tracking"]:::component
    cadence["<b>ReviewCadence</b><br/>is a review overdue?"]:::component
  end

  subgraph inputs["Repositories — jOOQ"]
    reads["<b>Weights · Entries · Profile · Goal</b>"]:::component
    reviews["<b>WeeklyReviewRepository</b><br/>the stored, irreversible reviews"]:::component
  end

  summary --> engine
  goal --> engine
  profile --> engine
  engine -- "is one due?" --> cadence
  engine -- "reads the week" --> reads
  engine --> trend
  engine --> maint
  engine --> targets
  engine -- "writes the review" --> reviews

  classDef component fill:#85bbf0,color:#000,stroke:#5d82a8
  style triggers fill:none,stroke:#666,stroke-dasharray:5 5
  style rules fill:none,stroke:#666,stroke-dasharray:5 5
  style inputs fill:none,stroke:#666,stroke-dasharray:5 5
```

### Backend: nutrition lookup

A barcode resolves to one of four outcomes: a Food already in the User's
catalog, a Food Candidate from a provider, a miss, or an Inconclusive Lookup when
the provider cannot be reached. Providers sit behind a capability-based port, so
the barcode chain and the AFCD text search share one seam without sharing a code
path ([ADR 0006](adr/0006-provider-agnostic-nutrition-lookup.md),
[ADR 0027](adr/0027-micronutrients-are-borrowed-bounded-and-never-a-target.md)).

```mermaid
flowchart LR
  subgraph callers["Callers"]
    foodCtl["<b>FoodController</b><br/>[Component: REST controller]<br/>Add-Food lookup, reference match"]:::component
    checkSvc["<b>CheckService</b><br/>[Component: Spring service]<br/>cost and return of a portion"]:::component
  end

  lookup["<b>BarcodeLookupService</b><br/>[Component: Spring service]<br/>catalog → cache → provider chain"]:::component
  foods["<b>FoodRepository</b><br/>[Component: jOOQ]<br/>the User's own catalog"]:::component
  cache["<b>InMemoryBarcodeLookupCache</b><br/>[Component: ConcurrentHashMap]<br/>shared per-barcode"]:::component

  subgraph port["NutritionProvider port"]
    offp["<b>OpenFoodFactsProvider</b><br/>[Component: RestClient]<br/>BARCODE_LOOKUP"]:::component
    afcd["<b>AfcdNutritionProvider</b><br/>TEXT_SEARCH"]:::component
  end

  refRepo["<b>ReferenceFoodRepository</b><br/>[Component: jOOQ, SQLite FTS5]<br/>AFCD seeded by Flyway"]:::component
  off["<b>Open Food Facts</b><br/>[Software System]"]:::ext

  foodCtl --> lookup
  checkSvc --> lookup
  lookup -- "1 · catalog hit?" --> foods
  lookup -- "2 · seen recently?" --> cache
  lookup -- "3 · BARCODE_LOOKUP only" --> offp
  offp -- "JSON/HTTPS" --> off
  foodCtl -- "search Reference Foods" --> refRepo
  afcd -. "search is served by" .-> refRepo

  classDef component fill:#85bbf0,color:#000,stroke:#5d82a8
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
  style callers fill:none,stroke:#666,stroke-dasharray:5 5
  style port fill:none,stroke:#666,stroke-dasharray:5 5
```

### Backend: the Weekly-Review Reminder

Tucker's only scheduled job, and it only *sends* — it computes no review. Each
hour it gives every User their own turn under their own identity, so the same
scoped repositories a request uses serve the cron too
([ADR 0010](adr/0010-minimal-scheduler-for-the-weekly-reminder.md)).

```mermaid
flowchart TD
  trigger["<b>ReminderSchedulerTrigger</b><br/>[Component: Spring @Scheduled]<br/>hourly, production only"]:::component
  scheduler["<b>ReminderScheduler</b><br/>[Component: Spring service]<br/>one turn per User, failures isolated"]:::component
  runas["<b>runAs</b><br/>[Component: SecurityContext]<br/>act as that User"]:::component
  turn["<b>UserReminder</b><br/>[Component: Spring service]<br/>one User's turn"]:::component
  policy["<b>ReminderPolicy</b><br/>[Component: domain rule]<br/>enabled, overdue, absent today, in the hour window, not sent yet"]:::component
  repos["<b>Profile · Reviews · Push Subscriptions · ReminderState</b><br/>[Component: jOOQ]"]:::component
  sender["<b>WebPushSender</b><br/>[Component: port → nl.martijndwars:web-push]"]:::component
  push["<b>Web Push services</b><br/>[Software System]"]:::ext
  sw["<b>Service worker</b><br/>[Container: push-sw.js]"]:::ext

  trigger --> scheduler
  scheduler --> runas
  runas --> turn
  turn -- "reads" --> repos
  turn -- "should it send?" --> policy
  turn -- "sends, prunes 410s, stamps dedupe" --> sender
  sender -- "Web Push/VAPID" --> push
  push --> sw

  classDef component fill:#85bbf0,color:#000,stroke:#5d82a8
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
```

### Frontend: the SPA and its server

The SPA holds no business rules — it presents fields the backend derived
([ADR 0002](adr/0002-business-logic-belongs-in-the-backend.md)). Its API client
is generated from the backend's committed OpenAPI spec, and every request goes
back to the origin it was served from.

```mermaid
flowchart TD
  subgraph spa["Single-page app — Nuxt 4 in the browser"]
    pages["<b>Pages</b><br/>[Component: Vue, Nuxt UI]<br/>Today · Log · Foods · Check · Review · Profile"]:::component
    composables["<b>Composables</b><br/>[Component: Vue composables]<br/>useApiMutation, useEntryLogging, …: reactive state, toasts, retry"]:::component
    scanner["<b>useBarcodeScanner</b><br/>[Component: zxing-wasm]<br/>decodes on-device"]:::component
    pwa["<b>usePwaInstall · useWebPush</b><br/>[Component: PushManager]<br/>install and reminders"]:::component
    plugins["<b>Plugins</b><br/>[Component: Nuxt plugins]<br/>auth-gate, csrf<br/>signed-out state, CSRF header"]:::component
    client["<b>API client</b><br/>[Component: nuxt-open-fetch]<br/>typed from openapi/tucker.json"]:::component
  end
  sw["<b>Service worker</b><br/>[Container: Workbox + push-sw.js]"]:::container

  subgraph nitro["Frontend server — Nitro"]
    proxy["<b>/api proxy</b><br/>[Component: Nitro route]<br/>forwards to TUCKER_API_UPSTREAM"]:::component
    signin["<b>/sign-in</b><br/>[Component: Nitro route]<br/>302 to / after Access sign-in"]:::component
  end
  api["<b>Backend API</b><br/>[Container: Kotlin, Spring Boot]"]:::ext

  pages --> composables
  pages --> scanner
  pages --> pwa
  composables --> client
  plugins -- "hooks into" --> client
  client -- "JSON/HTTPS, same origin" --> proxy
  proxy -- "JSON/HTTP" --> api
  pwa -- "subscribes" --> sw

  classDef component fill:#85bbf0,color:#000,stroke:#5d82a8
  classDef container fill:#438dd5,color:#fff,stroke:#2e6295
  classDef ext fill:#999,color:#fff,stroke:#6b6b6b
  style spa fill:none,stroke:#666,stroke-dasharray:5 5
  style nitro fill:none,stroke:#666,stroke-dasharray:5 5
```

## Data — the database schema

The SQLite schema as of the latest Flyway migration
(`backend/src/main/resources/db/migration/`), in two halves around the `user`
table: what a User eats, and what their body and plan are doing. Every table but
the reference data carries a `NOT NULL user_id`, and the uniqueness a User would
expect is per-User — one weigh-in per day, one Weekly Review per day, one active
Goal, a barcode once per catalog
([ADR 0021](adr/0021-every-row-is-owned-by-one-user.md)). `created_at` /
`updated_at` are omitted from every entity; dates are ISO-8601 `text`.

Relationship lines follow Mermaid's
[ER notation](https://mermaid.js.org/syntax/entityRelationshipDiagram.html): a
solid line is identifying (the foreign key is part of the child's primary key),
a dashed one is not.

### The catalog and the log

A Recipe is a `food` row of `kind = 'RECIPE'` whose ingredients are other Foods.
An Entry names a Food when it was weighed and names none when it is an estimate,
which the table's own `CHECK` enforces. `recipe_ingredient` carries no `user_id`:
it is owned through its Recipe.

```mermaid
---
title: The catalog and the log
---
erDiagram
  direction LR

  user ||..o{ food : "owns"
  user ||..o{ entry : "logs"
  user ||..o{ tag : "owns"
  food |o..o{ entry : "is logged as"
  food ||..o{ recipe_ingredient : "is a Recipe made of"
  food ||..o{ recipe_ingredient : "is an ingredient in"
  food ||--o{ food_tag : "carries"
  tag ||--o{ food_tag : "labels"
  reference_food |o..o{ food : "lends micronutrients to"

  user {
    integer id PK
    text email UK "case-insensitive"
  }
  food {
    integer id PK
    integer user_id FK
    text name
    text kind "FOOD or RECIPE"
    text barcode UK "per User"
    real calories_per_100g "4P + 4C + 9F"
    real protein_per_100g
    real carbs_per_100g
    real fat_per_100g
    real cooked_weight_g "Recipes only"
    integer reference_food_id FK
  }
  recipe_ingredient {
    integer id PK
    integer recipe_id FK "cascades with its Recipe"
    integer ingredient_food_id FK
    real grams "weighed as added"
  }
  entry {
    integer id PK
    integer user_id FK
    text logged_on
    text kind "WEIGHED or ESTIMATED"
    integer food_id FK "null for an estimate"
    real grams "null for an estimate"
    text label "an estimate's name"
    real calories "snapshot at logging"
    real protein
  }
  tag {
    integer id PK
    integer user_id FK
    text name UK "per User, case-insensitive"
  }
  food_tag {
    integer food_id PK, FK
    integer tag_id PK, FK
  }
  reference_food {
    integer id PK
    text public_food_key UK "AFCD's own key"
    text name UK
  }
```

`reference_food` also carries 19 micronutrient columns per 100 g (`fibre_g` to
`vitamin_e_mg`), left out of the box for size.

### The body, the plan and the reminder

```mermaid
---
title: The body, the plan and the reminder
---
erDiagram
  direction LR

  user ||..o| profile : "has"
  user ||..o{ weight_measurement : "weighs in"
  user ||..o{ goal : "sets"
  user ||..o{ weekly_review : "is reviewed in"
  user ||..o{ push_subscription : "is reached at"
  user ||..o| reminder_state : "is reminded by"

  user {
    integer id PK
    text email UK "case-insensitive"
  }
  profile {
    integer id PK
    integer user_id FK, UK
    text sex "MALE or FEMALE"
    text birth_date
    real height_cm
    integer tracks_calories "Calorie Tracking"
    text timezone
    integer reminder_hour
    integer reminders_enabled
  }
  weight_measurement {
    integer id PK
    integer user_id FK
    text measured_on UK "one per User per day"
    real weight_kg
  }
  goal {
    integer id PK
    integer user_id FK
    text started_on
    real start_weight_kg
    real target_weight_kg
    real rate_kg_per_week
    integer active "at most one per User"
    text reached_on "latched when reached"
  }
  weekly_review {
    integer id PK
    integer user_id FK
    text reviewed_on UK "one per User per day"
    real trend_weight_kg
    real maintenance_kcal "Intake Targets: all four or none"
    text maintenance_basis
    real calorie_budget_kcal
    real protein_floor_g
    text held_reason
  }
  push_subscription {
    integer id PK
    integer user_id FK
    text endpoint UK "global: one browser, one owner"
    text p256dh
    text auth
    text label
  }
  reminder_state {
    integer id PK
    integer user_id FK, UK
    text last_seen_on "absent-today gate"
    text last_reminder_sent_on "dedupe"
  }
```

### Reference data

Four tables belong to no User. They are seeded by migrations or bootstrapped by
the app, and the same for everybody.

| Table | Holds | Filled by |
| --- | --- | --- |
| `reference_food` | AFCD Release 3: 1,588 generic foods with micronutrients per 100 g, searched through the FTS5 index `reference_food_fts` | Flyway (V16, V17) |
| `reference_food_synonym` | Query rewrites for Reference Food search (`term` → `replacement`) | Flyway (V17) |
| `nutrient_reference_value` | NHMRC Nutrient Reference Values by nutrient, sex and the age a band opens at | Flyway (V18) |
| `app_config` | Installation-wide key/value settings, such as the VAPID key pair | The app, on first boot |

## Keeping this current

Update these diagrams in the same change whenever a module boundary, an external
integration, a data flow or the schema changes, and check the result in GitHub's
preview rather than only the source. Mermaid's C4 renderer places elements by
statement order and wraps its rows at the viewer's `screen.availWidth`, so a new
element can reshuffle a diagram that still parses. It also means a headless
renderer, whose screen is 800px wide, draws two elements per row whatever
`UpdateLayoutConfig` says.
