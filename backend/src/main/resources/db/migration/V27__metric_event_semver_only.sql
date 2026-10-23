-- A metric's app version is a semantic version, the only kind release order has a
-- place for (ADR 0038), and a row stored under anything else can no longer be read.
-- Before that rule an unstamped build sent `dev`, and the endpoint took any string,
-- so those rows are removed rather than kept beside the rest, as V25 and V26 removed
-- the rows they could not represent. SQLite has no regular expression, so this keeps
-- exactly the shape every deployed build has stamped (deploy/version.sh) - digits
-- only, three parts, no leading zero - each of which is a semantic version.
DELETE FROM metric_event WHERE NOT (
    app_version GLOB '[0-9]*.[0-9]*.[0-9]*'
    AND app_version NOT GLOB '*[^0-9.]*'
    AND app_version NOT GLOB '*.*.*.*'
    AND app_version NOT GLOB '0[0-9]*'
    AND app_version NOT GLOB '*.0[0-9]*'
);
