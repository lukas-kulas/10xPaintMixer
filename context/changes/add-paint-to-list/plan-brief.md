# Add Paint to List — Plan Brief

> Full plan: `context/changes/add-paint-to-list/plan.md`

## What & Why

Add the first domain feature to 10xPaintMixer: a searchable picker over the 210-paint catalog letting a user add paints to their private list. This is S-02 on the roadmap — the "north star" slice, chosen because it's the smallest proof that the data layer (F-01) and auth (S-01) actually work together end-to-end before investing in the more complex recipe-generation logic (S-04).

## Starting Point

The schema is live (`paints`, `user_paints`, RLS-scoped) and auth works end-to-end, but no domain API routes or UI exist yet — only the auth routes and a placeholder `/dashboard` page. This plan builds the first non-auth API route and the first React island that talks to it.

## Desired End State

A user opens `/dashboard/paints`, searches/filters the 210-paint catalog, clicks "Add" on a paint, and sees it marked owned instantly — no page reload. The state persists across a reload, proving the RLS-backed round-trip actually works.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| API style | JSON/fetch, not form-POST/redirect | A 210-item picker needs to stay mounted across multiple adds; a redirect-per-click would be unusable, and this becomes the pattern later slices can reuse. |
| Page location | `/dashboard/paints` (nested route) | Automatically protected by the existing `PROTECTED_ROUTES` prefix match — zero middleware changes needed. |
| Scope vs. S-03 | Add-only picker with inline "already added" indicators | Matches the roadmap's explicit split (S-02 = add, S-03 = view/remove, grouped deliberately since removal needs a real list to remove from). |
| Picker UX | Search box + type filter | 210 items is too many to scroll; type (Standard/Metallic/Washes) is the only catalog dimension worth filtering on today (single brand). |
| Duplicate add | Idempotent upsert (`ignoreDuplicates`) | Matches user intent regardless of prior state; picker's owned-indicators should make this path rare anyway. |
| Add feedback | Inline state flip, no navigation | Consistent with the JSON/fetch choice; preserves search/filter state across adds. |
| Error display | Reuse existing `config-status.ts` / inline-error pattern | Only one error-surfacing paradigm exists in this codebase — stay consistent rather than inventing a toast system. |

## Scope

**In scope:**
- `GET`/`POST /api/paints` (list with ownership, idempotent add)
- Searchable, type-filterable picker UI at `/dashboard/paints`
- Nav link from the existing dashboard placeholder

**Out of scope:**
- Standalone "my paints" list/remove view (S-03)
- Recipe generation (S-04)
- Brand filter (only one brand exists today)
- Toast/notification system, pagination, generated Supabase types

## Architecture / Approach

Two phases: an independently-testable JSON API route first (request-scoped Supabase client, same pattern as the auth routes, so RLS applies via the caller's real session), then a single React island (`client:load`) that fetches the catalog once and filters/adds entirely client-side.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API Route | `GET`/`POST /api/paints`, idempotent add, explicit 401 handling | `/api/*` isn't covered by `PROTECTED_ROUTES` — route must check auth itself, not rely on middleware redirect |
| 2. Picker UI | Search/filter picker page + nav link | First fetch-based island in the codebase — no existing pattern to copy directly |

**Prerequisites:** F-01 and S-01 both done (schema live, auth working).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- `/api/*` routes are unprotected by `PROTECTED_ROUTES` middleware by design — the plan compensates with an explicit per-route auth check, verified in Phase 1's manual criteria.
- No generated Supabase types yet — request/response shapes are hand-written and kept minimal to limit drift risk.

## Success Criteria (Summary)

- A user can find and add a paint from the 210-item catalog without a page reload.
- The add persists (visible as owned after a fresh page load).
- Unauthenticated requests to the API are rejected with 401, not a confusing RLS error.
