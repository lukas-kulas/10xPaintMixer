---
project: "10xPaintMixer"
version: 1
status: draft
created: 2026-09-08
updated: 2026-09-09
prd_version: 1
main_goal: low-complexity
top_blocker: time
milestone_id: first-mvp-flow
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xPaintMixer

> Wygenerowano z `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edytuj w miejscu; archiwizuj przy pełnej regeneracji.
> Slice'y poniżej są uporządkowane w kolejności zależności. Tabela "At a glance" to indeks.

## Milestone

**M-1: Rdzeń MVP — logowanie, lista farb, generowanie przepisu** — Status: open

- **Intent:** Dostarczyć kompletny, działający przepływ 10xPaintMixer opisany w PRD: użytkownik zakłada konto, buduje własną listę farb i otrzymuje wygenerowany przepis na docelowy kolor z tego, co faktycznie posiada.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** F-01 oraz S-01–S-04 poniżej mają Status: done.

## Vision recap

Hobbysta wargamingu/modelarstwa figurek ma ograniczoną fizycznie paletę farb i staje przed kolorem, którego nie posiada gotowego. Nie wie, jak bezpiecznie go zmieszać z tego, co ma — brak pewności co do proporcji prowadzi do paraliżu decyzyjnego lub zmarnowanej farby. Znane modele mieszania barw nikt dotąd nie połączył z konkretną, posiadaną przez użytkownika pulą farb w prostym produkcie podpowiadającym gotowy przepis.

## North star

**S-02: Użytkownik dodaje farbę do swojej listy** — najmniejszy dowód, że warstwa danych i logowanie faktycznie się łączą w jeden działający przepływ, zanim zainwestujemy w bardziej złożoną logikę mieszania kolorów (S-04); wybrane przez użytkownika jako gwiazda przewodnia spójna z celem "niska złożoność".

> Gwiazda przewodnia (ang. north star) — najmniejszy kompletny przepływ, który powinien powstać jako pierwszy, bo jego sukces jest warunkiem sensowności dalszych, bardziej złożonych kroków. W tym MVP to nie sama generacja przepisu (choć to główna hipoteza produktu — patrz kryterium sukcesu "75% akceptacji"), tylko krok wcześniejszy: potwierdzenie, że dane + logowanie realnie ze sobą współpracują.

## At a glance

| ID   | Change ID               | Outcome (user can …)                                              | Prerequisites | PRD refs             | Status   |
| ---- | ------------------------ | ------------------------------------------------------------------ | -------------- | --------------------- | -------- |
| F-01 | paint-color-data-schema  | (foundation) schemat danych: katalog farb, katalog kolorów, lista posiadanych farb z RLS | —              | FR-002, FR-003, FR-004, FR-005 | done |
| S-01 | user-signup-signin       | założyć konto i zalogować się (email + hasło)                      | —              | FR-001                | done |
| S-02 | add-paint-to-list        | dodać farbę do swojej listy z bazy dostępnych farb                 | F-01, S-01     | FR-002                | in-progress |
| S-03 | view-and-remove-paints   | przeglądać i usuwać farby ze swojej listy                          | F-01, S-02     | FR-003, FR-004        | proposed |
| S-04 | generate-color-recipe    | wybrać docelowy kolor i otrzymać przepis na jego zmieszanie z posiadanych farb | F-01, S-02     | FR-005, US-01          | proposed |

## Streams

Nawigacyjna pomoc — grupuje elementy o wspólnym łańcuchu Prerequisites. Kanoniczna kolejność wciąż żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania po równoległych ścieżkach.

| Stream | Theme                         | Chain                          | Note                                                                 |
| ------ | ------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| A      | Dane i lista farb              | `F-01` → `S-02` → `S-03`        | Główna ścieżka niskiej złożoności — od danych do widocznej listy.     |
| B      | Generowanie przepisu           | `S-04`                          | Dołącza do Stream A przy `S-02`; rdzeń hipotezy produktu, celowo po S-02. |
| C      | Konto i logowanie               | `S-01`                          | Samodzielny — już zaimplementowany, bez zależności od F-01.           |

## Baseline

Co już istnieje w kodzie na dzień `2026-09-08` (auto-researched + potwierdzone przez użytkownika).
Foundations poniżej zakładają, że to jest obecne i NIE scaffoldują tego ponownie.

- **Frontend:** present — szkielet Astro 6 + React 19, komponenty shadcn/ui (`src/components/ui/button.tsx`), elementy layoutu (`Topbar.astro`, `Banner.astro`, `Welcome.astro`), placeholder `src/pages/dashboard.astro`.
- **Backend / API:** partial — tryb `output: "server"` działa, ale istnieją wyłącznie trasy auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak tras domenowych (farby/kolory/przepisy).
- **Data:** absent — brak migracji/schematu; `CLAUDE.md` potwierdza, że Supabase służy dziś wyłącznie do auth, bez tabel aplikacyjnych.
- **Auth:** present — pełny przepływ email+hasło wdrożony end-to-end (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*`, `src/pages/auth/*.astro`) i działający na produkcji.
- **Deploy / infra:** present — wdrożone na Cloudflare Workers (`context/deployment/deploy-plan.md`, live URL); CI (`​.github/workflows/ci.yml`) uruchamia sync+lint+build, brak jeszcze auto-deploy.
- **Observability:** partial — wyłącznie wbudowane logi Cloudflare (`wrangler tail`, `observability.enabled: true`); brak dedykowanego error trackingu.

## Foundations

### F-01: Schemat danych farb i kolorów

- **Outcome:** (foundation) Supabase ma schemat: katalog referencyjny farb, katalog referencyjny docelowych kolorów oraz tabelę farb posiadanych przez użytkownika, ograniczoną RLS do właściciela; oba katalogi zasiane danymi startowymi.
- **Change ID:** paint-color-data-schema
- **PRD refs:** FR-002, FR-003, FR-004, FR-005, Access Control (prywatność danych użytkownika)
- **Unlocks:** S-02, S-03, S-04
- **Prerequisites:** — (projekt Supabase już wdrożony produkcyjnie, per `deploy-plan.md`)
- **Parallel with:** S-01 (niezależne — S-01 nie wymaga tego schematu)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jeśli schemat/RLS zostaną źle zaprojektowane teraz, każdy kolejny slice (S-02, S-03, S-04) odziedziczy błąd prywatności lub wymusi migrację — sekwencjonowane jako pierwsze, bo wszystkie slice'y czytają/piszą przez tę warstwę.
- **Status:** done

## Slices

### S-01: Rejestracja i logowanie

- **Outcome:** użytkownik może założyć konto i zalogować się (email + hasło).
- **Change ID:** user-signup-signin
- **PRD refs:** FR-001
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Brak ryzyka sekwencjonowania — funkcja już działa na produkcji (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*`). Wpis istnieje wyłącznie dla pokrycia FR-001 w roadmapie; nie wymaga nowej pracy implementacyjnej. Rekomendacja: jeśli zależy Ci na kompletnym śladzie zmian, zamknij go formalnie lekkim przebiegiem `/10x-plan` + `/10x-archive` zamiast pełnego planowania od zera.
- **Status:** done

### S-02: Dodanie farby do listy

- **Outcome:** użytkownik może dodać farbę do swojej listy, wybierając z bazy dostępnych farb.
- **Change ID:** add-paint-to-list
- **PRD refs:** FR-002
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gwiazda przewodnia — najmniejszy dowód, że warstwa danych i logowanie faktycznie współpracują, zanim zainwestujemy w bardziej złożoną logikę mieszania (S-04). Zsekwencjonowane zaraz po F-01/S-01, bez opóźniania dla symetrii.
- **Status:** in-progress

### S-03: Przeglądanie i usuwanie farb z listy

- **Outcome:** użytkownik może przeglądać swoją listę posiadanych farb oraz usunąć z niej farbę.
- **Change ID:** view-and-remove-paints
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Czy usunięcie farby wymaga dialogu potwierdzającego? — Owner: user. Block: no (decyzja projektowa/implementacyjna downstream, per notatka Sokratejska w PRD przy FR-004).
- **Risk:** Zgrupowane w jeden slice (widok + usuwanie), bo dotyczą tego samego bytu i typowo rozwijane razem; usuwanie bez uprzedniego dodawania (S-02) nie miałoby sensownego stanu do przetestowania.
- **Status:** proposed

### S-04: Generowanie przepisu na docelowy kolor

- **Outcome:** użytkownik wybiera docelowy kolor z bazy dostępnych kolorów i otrzymuje wygenerowany przepis na jego zmieszanie z posiadanych farb.
- **Change ID:** generate-color-recipe
- **PRD refs:** FR-005, US-01, NFR (wynik w ciągu kilku sekund)
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Jaki model mieszania kolorów/pigmentów zostanie użyty (np. proste uśrednianie RGB vs. model pigmentowy) i jakie atrybuty musi mieć każda farba/kolor w bazie? — Owner: team. Block: no (decyzja implementacyjna do rozstrzygnięcia w `/10x-plan`, nie blokuje sekwencjonowania roadmapy).
- **Risk:** To rdzeń hipotezy produktu (kryterium sukcesu: 75% akceptacji) — najbardziej złożona logika biznesowa w MVP, celowo zsekwencjonowana po S-02, żeby mieć realne dane farb do testowania algorytmu zamiast danych fikcyjnych.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                                       | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ------------------------ | ------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------ |
| F-01       | paint-color-data-schema  | Zaprojektuj i wdróż schemat danych: katalog farb, katalog kolorów, lista posiadanych farb (RLS) | yes                     | Brak prerequisite'ów — można planować od razu                            |
| S-01       | user-signup-signin       | Rejestracja i logowanie e-mail + hasło                                         | no                      | Już zaimplementowane i wdrożone; rozważ backfill przez `/10x-plan`+`/10x-archive` zamiast pełnego planowania |
| S-02       | add-paint-to-list        | Dodawanie farby do własnej listy                                               | no                      | Czeka na F-01                                                             |
| S-03       | view-and-remove-paints   | Przeglądanie i usuwanie farb z listy                                           | no                      | Czeka na F-01, S-02                                                       |
| S-04       | generate-color-recipe    | Generowanie przepisu na docelowy kolor z posiadanych farb                      | no                      | Czeka na F-01, S-02                                                       |

## Open Roadmap Questions

Brak otwartych pytań na poziomie roadmapy — PRD zamknięty bez luk (`quality_check_status: accepted`). Pytania implementacyjne (model mieszania kolorów, dialog potwierdzający usunięcie) żyją przy odpowiednich slice'ach (S-04, S-03) jako niewstrzymujące Unknowns.

## Parked

- **Generowanie listy wszystkich możliwych kombinacji kolorów** — Why parked: PRD §Non-Goals — MVP generuje przepis na żądanie dla jednego wybranego koloru, nie eksploruje całej przestrzeni kombinacji.
- **Dodawanie kolorów niestandardowych** — Why parked: PRD §Non-Goals — w MVP farby i docelowe kolory pochodzą wyłącznie z bazy dostępnych kolorów.
- **Import listy farb z pliku** — Why parked: PRD §Non-Goals — lista farb budowana wyłącznie ręcznie w MVP.
- **Współdzielenie list farb z innymi użytkownikami** — Why parked: PRD §Non-Goals — dane każdego użytkownika są prywatne i osobne.
- **Aplikacje mobilne** — Why parked: PRD §Non-Goals — MVP jest wyłącznie aplikacją webową na start.

## Milestone History

(Pusta — to pierwszy milestone.)

## Done

(Pusta na pierwszej generacji. `/10x-archive` doda tu wpis — i przełączy Status danego elementu na `done` — gdy zmiana o pasującym Change ID zostanie zarchiwizowana.)

- **S-01: użytkownik może założyć konto i zalogować się (email + hasło)** — Archived 2026-09-08 → `context/archive/2026-09-08-user-signup-signin/`. Lesson: —.
- **F-01: (foundation) Supabase ma schemat: katalog referencyjny farb, katalog referencyjny docelowych kolorów oraz tabelę farb posiadanych przez użytkownika, ograniczoną RLS do właściciela; oba katalogi zasiane danymi startowymi.** — Archived 2026-09-09 → `context/archive/2026-09-09-paint-color-data-schema/`. Lesson: —.
