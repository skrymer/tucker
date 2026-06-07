-- F6 slice 2 (issue #81): a small key-value application-config store, kept in
-- the SQLite DB so secrets self-bootstrap with no external secret store (ADR
-- 0012). Its first tenant is the self-generated VAPID keypair that signs Web
-- Push (its public half is handed to the browser, its private half signs the
-- reminder sender in a later slice). It rides along in the Litestream backup,
-- so the key is stable across boots and host moves.
CREATE TABLE app_config (
    config_key    TEXT PRIMARY KEY,
    config_value  TEXT NOT NULL
);
