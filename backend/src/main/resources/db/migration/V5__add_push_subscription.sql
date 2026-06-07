-- F6 slice 2 (issue #81): the Push Subscription store (CONTEXT.md Push
-- Subscription). One row per device — a browser-issued Web Push endpoint and
-- its keys — that Tucker stores so it can deliver a Weekly-Review Reminder to
-- that device while the app is closed. The endpoint is the device's identity, so
-- it is unique: re-subscribing the same device updates its keys in place. Pure
-- transport: it carries no schedule and no timezone (those live on the Profile).
CREATE TABLE push_subscription (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint    TEXT    NOT NULL UNIQUE,
    p256dh      TEXT    NOT NULL,
    auth        TEXT    NOT NULL,
    label       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
