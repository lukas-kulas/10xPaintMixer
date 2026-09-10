# View and Remove Paints — Plan Brief

> Full plan: `context/changes/view-and-remove-paints/plan.md`

## What & Why

Let a user see only the paints they actually own and remove any of them. This is S-03 on the roadmap — the second half of the paint-list CRUD, deliberately built after S-02 (add) because removal needs a real owned list to act on, and the roadmap groups both since they act on the same entity.

## Starting Point

S-02 shipped a full catalog picker at `/dashboard/paints` (`GET`/`POST /api/paints`, `PaintPicker.tsx`) that already shows owned/unowned status inline but has no way to see *only* what's owned, and no `DELETE` capability anywhere. The `user_paints` table already has an owner-scoped `DELETE` RLS policy from F-01 that's never been exercised by application code.

## Desired End State

A user opens a dedicated `/dashboard/my-paints` page, sees just their owned paints (searchable/filterable the same way the catalog is), and can remove any of them instantly with no page reload. Zero-owned users see a message pointing them back to Add Paints instead of a blank screen. Removal persists across a reload, proving the round-trip actually works.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| View placement | New dedicated `/dashboard/my-paints` page | Clean add/remove split matching the roadmap's own framing, over overloading `PaintPicker` with a second mode. | Plan (user-confirmed) |
| Delete confirmation | None — immediate optimistic remove | Matches S-02's instant-feedback add pattern; removal is fully reversible (re-add is one click) so a dialog adds friction without real safety value. | Plan (user-confirmed) |
| List filtering | Reuse search + type-filter UX from `PaintPicker` | User chose UX consistency with the catalog page over a bare list, despite owned lists likely being small. | Plan (user-confirmed) |
| Empty state | Message + link to Add Paints | Turns a dead end into a clear next action; matches the PRD's guardrail on readable messages for empty data. | Plan (user-confirmed) |
| Read endpoint | Reuse existing `GET /api/paints`, filter client-side | It already returns per-row `owned` status — a second endpoint would be pure duplication. | Plan |
| Delete route shape | `DELETE /api/paints/:id` (RESTful path param) | Coexists with the existing exact-path `/api/paints` route without conflict; matches REST convention better than a body-carrying DELETE. | Plan |
| Filter code sharing | Duplicate ~15 lines in the new component, no shared hook | Extracting a hook for two call sites is premature abstraction the project's low-complexity goal argues against. | Plan |

## Scope

**In scope:**
- `DELETE /api/paints/:id` (owner-scoped, idempotent)
- New `/dashboard/my-paints` page + `MyPaintsList` island: owned-only listing, search/type-filter, remove, two distinct empty states
- Dashboard nav fix: relabel the existing link to "Add Paints", add a correctly-pointed "My Paints" link

**Out of scope:**
- Remove affordance on the catalog/Add Paints page — stays add-only
- Confirmation dialog before remove
- New read endpoint — reuses `GET /api/paints`
- Shared filter hook between the two paint components
- Any interaction with recipe/mixing state (S-04 doesn't exist yet)

## Architecture / Approach

Same two-phase shape as S-02: an independently-testable `DELETE` API route first (same auth-check pattern as the existing `POST` handler), then a React island that duplicates `PaintPicker`'s filter/optimistic-update conventions for a genuinely different responsibility (manage-owned vs. browse-and-add).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Delete API Route | `DELETE /api/paints/:id`, idempotent, explicit 401 handling | Same `/api/*`-not-covered-by-`PROTECTED_ROUTES` gap as S-02 — route must self-check auth |
| 2. My Paints UI | Owned-only page + nav fix | Two empty states (zero-owned vs. no-filter-match) must stay visibly distinct or a filtered user gets misled into thinking they own nothing |

**Prerequisites:** F-01 and S-02 both done (schema live, add flow working).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The dashboard nav relabel touches a file already flagged for a pre-existing repo-wide CRLF lint issue (per S-02's `change.md` precedent) — expected to recur here and treated the same way (accepted, unrelated to this change).
- No new RLS/schema verification needed since the `DELETE` policy was already proven during F-01; this plan relies on that prior verification rather than re-testing RLS from scratch.

## Success Criteria (Summary)

- A user can see exactly the paints they've added, filtered/searched the same way the catalog is.
- Removing a paint is instant, no-reload, and persists across a page reload.
- A user with zero paints gets a clear path back to adding some, distinct from an over-filtered empty result.
