-- A metric's app version is a semantic version, the only kind release order has a
-- place for (ADR 0038). Before that rule an unstamped build sent `dev`, and a row
-- stored under it can no longer be read, so it is removed rather than kept beside
-- the rest, as V25 and V26 removed the rows they could not represent. SQLite has no
-- regular expression, so this matches the major.minor.patch shape every release has
-- carried, deploy/version.sh's - the only versions ever sent were that or `dev`.
DELETE FROM metric_event WHERE NOT (app_version GLOB '[0-9]*.[0-9]*.[0-9]*');
