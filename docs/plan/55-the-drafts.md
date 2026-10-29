# 55 — Drafts: named edits, kept and come back to (plan, 2026-10-29; after plan 53)

> The ask (2026-10-29): "It was nice if we could only save the existing edit and return later!
> Let's plan this, create a name for that edit and then when I finish I publish."

## Where we are (plan 53)

- Each admin has **one draft**, unnamed: a row of `ground_drafts` keyed by their id (the whole
  edits set, the revision it was made on, its size). God mode saves it on its own, 2.5 s after the
  last change (`PUT /api/admin/grounds/draft`).
- **It's kept already**: leave god mode and come back (another day, another browser) and it's
  there ("You have 40 unpublished changes: kept for next time"). If someone published meanwhile,
  it's brought up to date on opening (`mergeEdits`: what both changed, mine kept, and said).
- **Publish** (`god:publish`) reads that one draft on the world server, checks it, makes it the next
  revision with the dialog's note, and the draft goes. **Discard** empties it.
- So what's missing: **a name**, **more than one** (a bridge for later while the square's done
  today), and **saving on purpose** (knowing it's kept, and closing it without publishing).

## What we're making

- **Drafts with names.** "New draft…" asks a name ("The new bridge"). Its edits are saved to it as
  today (on their own, a few seconds after each change); **Save** is there too, saved now and said.
- **Several, one open.** An admin keeps up to 20 drafts. God mode opens one at a time: the plate
  and the draft strip show its name ("Draft · The new bridge · 12 changes · saved").
- **Come back later.** Going into god mode: the last one open again; or the **Drafts** list to pick
  one (its name, its changes, when it was saved, the revision it's on; live moved on since: "will be
  brought up to date"). Open, rename, duplicate, delete.
- **Publish when it's done.** Publish the open draft: the dialog's note starts as its name; the
  revision's history shows it. It's gone from the list once it's published (kept with the revision:
  the history can open what it was).
- **Others' publishes meanwhile**: as today, brought up to date when it's opened (and while it's
  open), the overlaps said. A draft made on revision 150 and opened at 158: merged with what's
  live, its own changes kept where both touched.
- **Leaving** keeps it (saved, closed). **Discard** becomes "Delete draft" (asked first).

## The design

### A. The API

- `ground_drafts` gets its own `id`, a `name` (≤ 60), `user_id` (no longer the key), `created_at`;
  `base_rev`, `data`, `size`, `updated_at` as they are. A new migration (the plan 53 one ran on the
  dev database): today's single drafts become one named "Draft" each.
- Routes (admins only, as plan 53's):
  - `GET /api/admin/grounds/drafts`: mine, newest first (id, name, baseRev, size, changes, dates;
    not the data).
  - `POST /api/admin/grounds/drafts` `{name, baseRev, data?}`: a new one (from nothing, or a
    duplicate's data). At most 20: refused with why.
  - `GET|PUT|DELETE /api/admin/grounds/drafts/{id}`: one of mine (`PUT`: its data and base, or its
    name). Someone else's: 404.
  - The world server's: `GET /api/internal/grounds/drafts/{id}`; the publish takes `draftId` and
    removes that one (`fromDraft` today).
  - `ground_revisions` gets `draft_name` (what was published, for the history).
  - The old single-draft routes go (god mode and the e2e move to the new ones).
- The changes count is kept with the row on each save (the client counts them: `editsCount`), so the
  list doesn't decode every draft.

### B. The world server

- `god:publish {draftId, note}`: that draft, the admin's own; else refused. The rest as today.
- Offline (tests, world files): the drafts kept by id.

### C. The client

- The **Drafts** list (a panel over the god camera; on a phone, a sheet): the mock 15-drafts.
- The plate and strip show the open draft's name; **Save** in the strip (saving / saved / failed);
  the publish dialog's note starts as the name.
- `GodController` keeps the open draft's id; `localStorage` remembers the last one open (a
  convenience: the list is the API's).
- Undo and redo stay a session's, per draft (switching starts a fresh history).

### D. What doesn't change

- The edits' rules, the merge, the redraw, publish and roll back, Walk it: plan 53's.
- Drafts stay private to their admin (plan 53's open question 2, as planned).

## Phases

0. **Mocks**: 15-drafts (the list, new and rename), the strip and plate with a name, the publish
   dialog's note from the name. For your approval, as plan 53's.
   *Made 2026-10-29* (`design/god/mock/god.html?s=drafts|named|publishnamed|mdrafts`, as plan 53's):
   `15-drafts` (the list from the draft's name: new, open, ⋯ rename / duplicate / delete, one
   made on an older revision), `16-named` (the strip with the name and Save, "Saved", a new
   draft's name asked on the first change), `17-publish-named` (the note from the name),
   `18-mobile-drafts` (the list as a sheet).
1. **API**: the migration (today's drafts kept, named "Draft"), the routes, `draft_name` on
   revisions; Pest on the host's sqlite (never the dev database).
   *Built 2026-10-29*: `2026_10_29_000002_named_ground_drafts` (a new table swapped in: each
   admin's one draft becomes "Draft"; the dev database had none), `GroundDraft::MAX` 20, the count
   kept as `change_count` (a column called `changes` is Eloquent's own `$changes`), the routes
   (`/api/admin/grounds/drafts`, `…/{id}`; the world server's `/api/internal/grounds/drafts/{id}`),
   the publish's `draftId` (the admin's own, else 404) and the revision's `draft_name` (`draft` in
   the history). `GroundsTest.php` on the host: 4 tests, 89 assertions.
2. **World server**: publish by `draftId`; `godmode.test.ts` (a member's, another admin's draft
   refused; the published one gone, the others kept).
   *Built 2026-10-29*: `god:publish {draftId, note}` (shared protocol), the draft fetched by id and
   refused unless it's the admin's (`refuse`: "There's no draft to publish."); offline drafts by id
   with their owner; the admin log names the draft. `godmode.test.ts` 5/5 (another admin's draft,
   none, a member's: refused; the published one gone, the other kept); `perf.mts` publishes by id.
3. **Client**: the list, open, new, rename, duplicate, delete; Save; the name about; the last one
   open again.
   *Built 2026-10-29*: `GodController` keeps the open draft's id and name (`hud.god.draft`); going
   in, the one open last (`localStorage` `yutopia:god-draft`) else the newest, else none — the
   first change then asks a name (`naming`; Cancel undoes it, leaving keeps it by the name in the
   box). Saves go to it by id (none while unnamed); the strip's name opens the list (`DraftsPanel`:
   new, open, ⋯ rename / duplicate / delete asked first; on a phone a sheet from the plate's name),
   Save says "Saved: …", Discard's gone; switching saves the open one and lets the tools' picks go;
   publish sends its id, the note starts as its name, and after it nothing's open. The admin page
   lists them and the history says which draft each revision came from.
4. **Checks**: e2e — two drafts made and named, switched between, god mode left and come back to
   (both kept), one published (the history names it), the other opened on the new revision and
   brought up to date; the plan 53 specs on the new routes.
   *Built 2026-10-29*: `godmode-drafts.spec` (as above, the published one rolled back at once:
   a run that times out after publishing left it live once); the plan 53 specs make their own named
   draft (`helpers.ts makeDraft`) and delete theirs (`clearDrafts`), the shell's asks its name on
   the first change.

## Decisions (the user's, 2026-10-29)

The proposals taken:
1. **Private**: each admin's drafts their own.
2. **20 each.**
3. **Published drafts go** from the list (kept with the revision: the history opens what it was).
4. **Saved on their own** as today, **plus a Save button**.

## Open questions (asked 2026-10-29, answered above)

1. **Private or shared**: each admin's drafts their own (as now), or every admin sees and can
   open every draft (two at once: the last save wins)?
2. **How many**: 20 each enough?
3. **Published drafts**: gone from the list (kept only with the revision, as proposed), or kept
   in the list, marked published, to start a next one from?
4. **Saving**: on its own as today, plus a Save button (proposed); or only when you press Save?
