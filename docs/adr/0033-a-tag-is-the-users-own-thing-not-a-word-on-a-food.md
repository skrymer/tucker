# A Tag is the User's own thing, not a word on a Food

A User can **Tag** their Foods — "breakfast", "post-workout" — and narrow the **Log**
destination to one Tag. We decided a Tag is a thing in its own right, owned by its
**User**: it has a name unique to that User regardless of case, it outlives the last
Food carrying it, renaming it reaches every Food at once, and renaming it onto
another Tag's name **merges** the two. The obvious cheaper model — a list of strings
stored on each Food — was considered and rejected, because it cannot express what the
User asked for: to *manage* their Tags.

*Status: accepted. The term is defined in [`CONTEXT.md`](../../CONTEXT.md) (**Tag**);
it narrows the destination [ADR 0028](0028-logging-is-its-own-destination.md) built,
and is owned per [ADR 0021](0021-every-row-is-owned-by-one-user.md).*

## Considered options

- **Fixed meal slots** (breakfast / lunch / dinner / snack). Rejected before anything
  else: `CONTEXT.md` has already resolved that there is **no Meal object**, and a slot
  vocabulary would bring it back in through another word. It also cannot say
  "post-workout".
- **Derived from when Entries are logged** ("what you usually log around now").
  Rejected in favour of the User's own choice: it needs a time of day Tucker does not
  store, adds a second ranking beside **Frequent Foods** with an arbitrary boundary
  for where "morning" ends — the tuning-parameter shape ADR 0028 refused — and cannot
  express a Tag that is not about time at all.
- **Tags as words stored on each Food.** The simplest model: a Tag exists only while
  some Food carries it, and "renaming" is editing every Food by hand. Rejected
  because the User wants to manage Tags — tidy "brekkie" into "breakfast" once,
  delete one everywhere, create one before tagging anything — and every one of those
  is either impossible or an N-row edit in this model. Moving from it to the entity
  later is a data migration; so is moving back, so the choice is worth making once.

## Consequences

- **A Tag is owned by one User** (`UNIQUE(user_id, name COLLATE NOCASE)`), and the
  Food ↔ Tag link is owned *through* both ends, the way `recipe_ingredient` is owned
  through its Recipe (ADR 0021): no `user_id` of its own to keep in agreement, and a
  foreign Food or Tag id answers exactly as an absent one.
- **Case-insensitive identity is a backend fact, not a UI convention.** "Breakfast"
  typed against an existing "breakfast" resolves to the one that exists; the
  existing spelling wins. The database enforces it for ASCII (`COLLATE NOCASE`, which
  folds nothing else); the domain's `TagName` folds the whole of Unicode, so an
  accented name resolves to the Tag it already is — except when two requests create
  its two spellings at the same instant, which the index cannot see.
- **Renaming onto an existing name merges rather than refusing.** Refusing would make
  the cleanup the feature exists for a by-hand re-tag of every Food followed by a
  delete. The merge loses nothing — every Food still carries a Tag — and is announced
  before it happens. It is irreversible in the same way deleting a Tag is.
- **Deleting a Tag takes it off every Food and deletes no Food.** A Tag carrying no
  Foods is kept until deleted, which is the one state the words-on-a-Food model could
  not represent.
- **Log offers only Tags that lead somewhere.** An empty Tag is shown where Tags are
  managed and attached, never as a chip that would narrow `/log` to nothing.
- **Narrowing is the client's, over the catalog already fetched** — the same reason
  ADR 0028's filter field is. A chosen Tag replaces the **Frequent Foods** grid with
  one flat alphabetical list, exactly as a typed query does, and combines with a
  query rather than resetting it. Ranking *within* a Tag was prototyped and not
  chosen: a Tag is a short list the User assembled themselves, so the grid's job —
  putting the next Entry within one tap of a long catalog — is already done.
- **Tags are offered alphabetically, not by use.** An order that moves with a User's
  logging puts the Tag they are looking for somewhere different each week; a User
  looking for a Tag looks for it by name.
- Nothing about a Tag reaches the adaptive engine, a **Weekly Review**, or any
  figure Tucker states. It is navigation over the catalog, and the no-good-or-bad
  rule is untouched: a Tag is the User's word, never Tucker's verdict.
