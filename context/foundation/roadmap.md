---
project: "10xPaintMixer"
version: 1
status: draft
created: 2026-09-08
updated: 2026-09-14
prd_version: 2
main_goal: low-complexity
top_blocker: time
milestone_id: saved-recipes-with-notes
milestone_seq: 2
milestone_status: open
---

# Roadmap: 10xPaintMixer

> Wygenerowano z `context/foundation/prd-v2.md` (v2, brownfield) + auto-researched codebase baseline.
> Edytuj w miejscu; archiwizuj przy pełnej regeneracji.
> Slice'y poniżej są uporządkowane w kolejności zależności. Tabela "At a glance" to indeks.

## Milestone

**M-2: Zapisane przepisy z notatkami** — Status: open

- **Intent:** Umożliwić użytkownikowi trwałe zapisanie wygenerowanego przepisu,
  przeglądanie listy zapisanych przepisów oraz zarządzanie nimi (usuwanie, notatki), przy
  zachowaniu pełnej prywatności i bez regresji istniejącego przepływu generowania z M-1.
  Zakres rozszerzony 2026-09-14 o trzy drobne poprawki zgłoszone przez użytkownika
  (branding aplikacji, tekst na dashboardzie i przekierowanie po logowaniu) — patrz kotwice
  MS-01, MS-02, MS-03 poniżej.
- **Source materials:** `context/foundation/prd-v2.md` (v2); opis użytkownika 2026-09-14 (MS-01, MS-02, MS-03)
- **Done when:** S-01, S-02 i S-03 poniżej mają Status: `done`.
- **Scope anchors:** US-01; Scope of Change (4×`[new]`, 1×`[modified]`, 1×`[preserved]`)
  - MS-01: Zamienić placeholderowy branding startera ("10x Astro Starter" / opis
    "A production-ready starter with authentication, modern tooling, and a cosmic developer
    experience.") na właściwy branding produktu ("10xPaintMixer" / "Easy way to mix new
    colors from old paints").
  - MS-02: Po poprawnym zalogowaniu użytkownik ma trafiać na dashboard, nie na stronę główną.
  - MS-03: Zamienić tekst na dashboardzie "This page is only for authenticated users." na
    wskazówkę dot. przepływu produktu: "first create list of your paints, next generate
    recipe".

## Vision recap

Hobbysta, który wygenerował przepis na docelowy kolor, nie ma dziś żadnej możliwości
wrócenia do niego później — przepis znika z ekranu zaraz po wyświetleniu, mimo że w tle
jest już zapisany. Podczas malowania figurki użytkownik często wraca do przepisu
wielokrotnie i chciałby dopisać własne obserwacje. To świadomie odłożona luka z M-1, nie
przeoczenie — teraz, gdy podstawowy przepływ generowania działa na produkcji, warto ją
odblokować.

## North star

**S-01: Zapisz → zobacz na liście → usuń / dodaj notatkę / edytuj notatkę** — to jedyna
historyjka w tym milestone'ie i najmniejszy pełny dowód, że cała funkcja działa
end-to-end.

> Gwiazda przewodnia (ang. north star) — najmniejszy kompletny przepływ, który powinien
> powstać jako pierwszy, bo jego sukces jest warunkiem sensowności tej funkcji w ogóle.
> W tym milestonie to nie osobna decyzja sekwencjonowania — PRD v2 opisuje cały zakres
> jako jeden, nierozdzielny przepływ (kryterium sukcesu Primary).

## At a glance

| ID   | Change ID                | Outcome (user can …)                                                                    | Prerequisites | PRD refs | Status |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------- | -------------- | -------- | ------ |
| S-01 | saved-recipes-with-notes  | zapisać wygenerowany przepis, zobaczyć go na liście zapisanych przepisów, usunąć go oraz dodać/edytować notatkę | —              | US-01    | in-progress  |
| S-02 | starter-branding-cleanup  | zobaczyć poprawną nazwę, opis aplikacji (10xPaintMixer) i wskazówkę na dashboardzie zamiast zalegającego tekstu ze startera Astro | —              | MS-01, MS-03 | ready  |
| S-03 | post-signin-dashboard-redirect | zostać przeniesionym na dashboard od razu po poprawnym zalogowaniu | —              | MS-02    | in-progress  |

## Baseline

Co już istnieje w kodzie na dzień `2026-09-11` (potwierdzone przez `/10x-stack-assess` i
analizę kodu). Ten milestone nie scaffolduje żadnej z poniższych warstw ponownie.

- **Frontend:** present — Astro 6 + React 19 wyspy, strony dashboardu
  (`src/pages/dashboard/*.astro`), generator przepisu (`src/components/recipe/RecipeGenerator.tsx`).
- **Backend / API:** present — trasy API (`src/pages/api/{paints,recipe,auth}/*`), każda
  samodzielnie wymusza autoryzację.
- **Data:** present — schemat Supabase (katalog farb/kolorów, `user_paints`, `recipes`),
  reguły prywatności per-użytkownik, migracje w `supabase/migrations/`.
- **Auth:** present — logowanie email + hasło, middleware chroniący `/dashboard`
  (potwierdzone też w `tech-stack.md`: `has_auth: true`).
- **Deploy / infra:** present — Cloudflare Workers, wdrożone i działające
  (`context/deployment/deploy-plan.md`); CI uruchamia sync + lint + build.
- **Observability:** partial — wyłącznie wbudowane logi Cloudflare; brak dedykowanego
  error trackingu (bez zmian od M-1).

## Foundations

Brak. Wszystkie warstwy potrzebne do tego milestone'u są już obecne w kodzie (patrz
Baseline powyżej) — nie ma tu cross-cuttingowego elementu, który blokowałby S-01.

## Slices

### S-01: Zapisz, przeglądaj i zarządzaj zapisanymi przepisami

- **Outcome:** użytkownik może zapisać wygenerowany przepis, zobaczyć go na liście
  zapisanych przepisów, usunąć go oraz dodać i edytować notatkę.
- **Change ID:** saved-recipes-with-notes
- **PRD refs:** US-01
- **Prerequisites:** — (wszystkie potrzebne warstwy już obecne w kodzie, patrz Baseline)
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** — (PRD v2 nie ma otwartych pytań — `quality_check_status: accepted`)
- **Risk:** To jeden, ściśle powiązany przepływ (zapisz → lista → usuń/notatka), opisany
  w PRD jako pojedyncza historia z jednym kryterium sukcesu end-to-end — sztuczny podział
  na mniejsze kawałki nie miałby sensownego stanu do przetestowania (lista bez elementów
  nie daje nic do usunięcia ani do opisania notatką).
- **Status:** in-progress

### S-02: Poprawny branding aplikacji

- **Outcome:** użytkownik widzi nazwę "10xPaintMixer" i opis "Easy way to mix new colors
  from old paints" zamiast placeholderowego tekstu ze startera Astro ("10x Astro Starter" /
  "A production-ready starter with authentication, modern tooling, and a cosmic developer
  experience."), a na dashboardzie zamiast "This page is only for authenticated users."
  widzi wskazówkę co do przepływu produktu ("first create list of your paints, next
  generate recipe").
- **Change ID:** starter-branding-cleanup
- **PRD refs:** MS-01, MS-03
- **Prerequisites:** —
- **Parallel with:** S-01, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Czysto tekstowa zmiana w trzech miejscach (tytuł strony, treść komponentu
  powitalnego, komunikat na dashboardzie) — niskie ryzyko techniczne; jedyne ryzyko to
  przeoczenie innego miejsca, gdzie tekst startera nadal występuje (np. README, meta tagi),
  co `/10x-plan` powinien zweryfikować.
- **Status:** ready

### S-03: Przekierowanie na dashboard po zalogowaniu

- **Outcome:** użytkownik po poprawnym zalogowaniu trafia bezpośrednio na dashboard, a nie
  na stronę główną.
- **Change ID:** post-signin-dashboard-redirect
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zmiana jednej ścieżki przekierowania w istniejącym route'cie logowania — niskie
  ryzyko, ale wymaga sprawdzenia, czy strona główna ("/") pełni dziś jakąś inną rolę dla
  zalogowanych użytkowników, zanim przekierowanie zostanie zmienione na dashboard.
- **Status:** in-progress

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                                  | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------- | -------------------------------------------------------------------------- | ---------------------- | ----- |
| S-01       | saved-recipes-with-notes  | Zapisywanie, przeglądanie i zarządzanie zapisanymi przepisami (usuwanie, notatki) | yes                     | Run `/10x-plan saved-recipes-with-notes` |
| S-02       | starter-branding-cleanup  | Poprawny branding aplikacji (nazwa, opis, wskazówka na dashboardzie) zamiast tekstu ze startera | yes                     | Run `/10x-plan starter-branding-cleanup` |
| S-03       | post-signin-dashboard-redirect | Przekierowanie na dashboard po poprawnym zalogowaniu | yes                     | Run `/10x-plan post-signin-dashboard-redirect` |

## Open Roadmap Questions

Brak otwartych pytań na poziomie roadmapy — PRD v2 zamknięty bez luk
(`quality_check_status: accepted`, zapisane w `shape-notes.md`). S-02 i S-03 pochodzą z
opisu użytkownika (MS-01, MS-02, MS-03 w karcie milestone'u), nie z PRD.

## Parked

- **Sortowanie/filtrowanie listy zapisanych przepisów** — Why parked: PRD v2 §Poza
  zakresem — przedwczesna optymalizacja przy małej skali i krótkim budżecie czasowym.
- **Współdzielenie zapisanych przepisów z innymi użytkownikami** — Why parked: PRD v2
  §Poza zakresem — dane każdego użytkownika są prywatne i osobne.
- **Kosz / przywracanie usuniętych przepisów** — Why parked: PRD v2 §Poza zakresem —
  usunięcie jest trwałe i natychmiastowe, bez możliwości cofnięcia.

## Milestone History

- **M-1: Rdzeń MVP — logowanie, lista farb, generowanie przepisu** (`first-mvp-flow`) — closed 2026-09-11. Kompletny przepływ end-to-end: rejestracja/logowanie, schemat danych farb i kolorów z RLS, dodawanie/przeglądanie/usuwanie farb z listy, generowanie przepisu na docelowy kolor z posiadanych farb.

## Done

(Pusta na pierwszej generacji tego milestone'u. `/10x-archive` doda tu wpis — i przełączy
Status danego elementu na `done` — gdy zmiana o pasującym Change ID zostanie
zarchiwizowana.)
