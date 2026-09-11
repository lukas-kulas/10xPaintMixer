---
project: "10xPaintMixer"
context_type: brownfield
created: 2026-09-11
updated: 2026-09-11
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria zmiany"
      decision: "znacząca nowa funkcja — nowy widok listy zapisanych przepisów + zapisz/usuń/notatki na bazie istniejącego przepływu generowania"
    - topic: "insight"
      decision: "świadomie odłożone w MVP — PRD v1 skupił się na jednorazowym wygenerowaniu przepisu (kryterium: 75% akceptacji); historia/notatki byłyby przedwczesną optymalizacją przed walidacją algorytmu"
    - topic: "zakres person"
      decision: "bez zmian — ten sam hobbysta wargamingu/modelarstwa, ten sam model dostępu (email+hasło, dane prywatne per użytkownik)"
    - topic: "guardrail #2"
      decision: "prywatność dodana jako guardrail — user A nie widzi/nie edytuje zapisanych przepisów ani notatek user B"
    - topic: "semantyka zapisu"
      decision: "tylko kliknięcie \"Zapisz\" zachowuje przepis na trwałe — generowanie samo w sobie przestaje trwale zapisywać do bazy"
  frs_drafted: 6
  quality_check_status: accepted
---

# Shape Notes — 10xPaintMixer (M-2: zapisane przepisy)

Seed idea (od użytkownika):

> Chcę rozszerzyć funkcjonalność generowania przepisów kolorów. W "/dashboard/recipe" po
> wygenerowaniu przepisu powinna być opcja zapisz. Na nowej zakładce powinna pojawić się
> lista zapisanych przez użytkownika przepisów. Przepisy na liście powinny mieć opcje
> usuwania, dodawania notatek, oraz edytowania notatek.

## Current System

- **System purpose:** aplikacja webowa pomagająca hobbystom wargamingu/modelarstwa
  wygenerować przepis na zmieszanie docelowego koloru z farb, które faktycznie posiadają.
- **Key architecture:** Astro 6 (`output: "server"`) + wyspy React 19, wdrożone na
  Cloudflare Workers (`workerd`) przez adapter `@astrojs/cloudflare`.
- **Tech stack:** TypeScript, Astro, React, Supabase (Postgres + Auth + RLS), Cloudflare
  Workers, `spectral.js` (silnik mieszania kolorów).
- **Current user base:** mali, zalogowani użytkownicy (email + hasło); każdy widzi
  wyłącznie własne dane (RLS po `user_id`).
- **Core functionality dziś:** rejestracja/logowanie; budowanie własnej listy posiadanych
  farb (dodaj / przeglądaj / usuń); generowanie przepisu na docelowy kolor z posiadanych
  farb (`POST /api/recipe`). Przepis jest przy tym już dziś cicho zapisywany do tabeli
  `recipes`, ale użytkownik nie ma żadnego sposobu, by go później zobaczyć, usunąć ani
  opisać notatką.

## Vision & Problem Statement

Hobbysta, który wygenerował przepis na `/dashboard/recipe`, nie ma dziś żadnej możliwości
wrócenia do niego później — przepis znika z ekranu zaraz po wyświetleniu, mimo że w tle
jest już zapisany w bazie. W praktyce, podczas malowania figurki, użytkownik często wraca
do przepisu wielokrotnie (np. żeby domieszać więcej farby) i chciałby dopisać własne
obserwacje (np. "za dużo bieli, następnym razem mniej").

To świadomie odłożona luka, nie przeoczenie: PRD v1 skupił się wyłącznie na sprawdzeniu,
czy sam algorytm generowania trafia w oczekiwania użytkownika (kryterium sukcesu: 75%
akceptacji) — dodawanie historii i notatek przed potwierdzeniem tej hipotezy byłoby
przedwczesną optymalizacją. Teraz, gdy milestone M-1 jest zamknięty i podstawowy przepływ
generowania działa na produkcji, warto odblokować tę wartość.

## User & Persona

Bez zmian względem M-1: hobbysta wargamingu/modelarstwa figurek, zalogowany przez
email + hasło, zarządza wyłącznie własnymi danymi. Ta zmiana nie wprowadza nowej persony
ani nie zmienia modelu dostępu.

## Access Control

No changes planned — current model preserved. Logowanie email + hasło, płaski model ról
(jedna rola „użytkownik”, bez ról administracyjnych). Zapisane przepisy i ich notatki
dziedziczą dokładnie ten sam model własności co dziś: wyłącznie użytkownik, który
wygenerował dany przepis, może go widzieć, edytować notatkę i usunąć — wymuszone przez RLS
po `user_id`, tak jak istniejące tabele `user_paints` i `recipes`.

## Success Criteria

### Primary
- Pełny przepływ zapisz → zobacz na liście zapisanych przepisów → usuń / dodaj notatkę /
  edytuj notatkę działa end-to-end.

### Secondary
- (brak — bez miłych dodatków w tym zakresie)

### Guardrails
- Istniejący przepływ generowania przepisu na `/dashboard/recipe` działa dokładnie jak
  dziś — bez regresji.
- Prywatność: użytkownik A nie widzi ani nie może edytować/usuwać zapisanych przepisów
  ani notatek użytkownika B.

## Functional Requirements

- FR-001: Użytkownik może zapisać wygenerowany przepis z widoku `/dashboard/recipe`. Priority: must-have. Change: new
  > Socrates: Rozważony kontrargument: "przycisk 'Zapisz' to dodatkowe tarcie tuż po
  > zobaczeniu wyniku, może obniżyć konwersję". Rozstrzygnięcie: FR zostaje bez zmian —
  > wyraźny, świadomy akt zapisu jest zgodny z ustaloną semantyką "Zapisz = trwały zapis";
  > tarcie jest akceptowalnym kosztem za kontrolę użytkownika nad tym, co zachowuje.
- FR-002: Wygenerowanie przepisu nie zapisuje go już automatycznie na trwałe — dopiero kliknięcie „Zapisz" tworzy trwały wpis. Priority: must-have. Change: modified
  > Socrates: Rozważony kontrargument: "zmiana koliduje z metryką sukcesu PRD v1 (75%
  > akceptacji)". Rozstrzygnięcie: FR zostaje bez zmian — metryka nigdy nie była mierzona
  > liczbą wierszy w tabeli `recipes` (nie ma dziś żadnego UI do tego), to był wyłącznie
  > efekt uboczny implementacji, nie sygnał biznesowy; zmiana jest bezpieczna.
- FR-003: Użytkownik może przeglądać listę swoich zapisanych przepisów na nowej zakładce. Priority: must-have. Change: new
  > Socrates: Rozważony kontrargument: "brak sortowania/filtrowania może czynić listę
  > bezużyteczną przy wielu wpisach". Rozstrzygnięcie: FR zostaje bez zmian, sortowanie/
  > filtrowanie poza zakresem — przy małej skali (target_scale: small) i 3-dniowym
  > budżecie to przedwczesna optymalizacja; do rozważenia w kolejnej iteracji.
- FR-004: Użytkownik może usunąć zapisany przepis ze swojej listy. Priority: must-have. Change: new
  > Socrates: Rozważony kontrargument: "usunięcie bez potwierdzenia grozi przypadkową,
  > nieodwracalną utratą przepisu i notatki". Rozstrzygnięcie: FR zostaje bez zmian; czy
  > istnieje dialog potwierdzający to decyzja projektowa/implementacyjna downstream, nie
  > treść PRD — spójne z precedensem usuwania farby w M-1.
- FR-005: Użytkownik może dodać notatkę do zapisanego przepisu i później ją edytować (jedno edytowalne pole tekstowe). Priority: must-have. Change: new
  > Socrates: Rozważone dwa kontrargumenty: (1) "czy notatka jest opcjonalna przy
  > zapisie?" — Rozstrzygnięcie: notatka jest opcjonalna, dodawana później z widoku
  > listy, "Zapisz" sam w sobie nie wymaga notatki. (2) "dodawanie i edycja notatki to
  > osobne FR-y?" — Rozstrzygnięcie: scalone w jeden FR, spójnie z precedensem z M-1
  > (edycja farby odrzucona jako osobny FR) — to jedno edytowalne pole, nie dwie zdolności.
- FR-006: Przepływ wyboru docelowego koloru i wynik algorytmu generowania (proporcje, jakość dopasowania) działają dokładnie tak jak dziś. Priority: must-have. Change: preserved
  > Socrates: Rozważony kontrargument: "koliduje z FR-002 — granica 'co się zmienia'
  > jest niejasna". Rozstrzygnięcie: doprecyzowano — FR-006 dotyczy WYŁĄCZNIE wyboru
  > koloru i wyniku algorytmu (użytkownik widzi identyczny wynik jak dziś); FR-002
  > dotyczy WYŁĄCZNIE trwałości zapisu tego wyniku. Rozłączne zakresy.

## User Stories

### US-01: Użytkownik zapisuje wygenerowany przepis i zarządza nim później

- **Given** zalogowany użytkownik, który właśnie wygenerował przepis na docelowy kolor
- **When** klika przycisk „Zapisz"
- **Then** przepis pojawia się na jego liście zapisanych przepisów, widocznej na nowej zakładce

#### Acceptance Criteria
- Zapisany przepis pozostaje widoczny na liście po odświeżeniu / ponownym zalogowaniu
- Przepis, którego użytkownik NIE zapisał, nie pojawia się na liście (generowanie samo
  w sobie nie tworzy trwałego wpisu)
- Użytkownik może usunąć zapisany przepis z listy
- Notatka jest opcjonalna przy zapisie; użytkownik może dodać ją później z listy i
  edytować w dowolnym momencie
- Inny użytkownik nie widzi ani nie może zmodyfikować cudzych zapisanych przepisów ani notatek

## Business Logic

No domain logic change. To rozszerzenie zakresu CRUD (trwały zapis, usuwanie, notatki) —
istniejąca reguła mieszania kolorów (algorytm generowania przepisu) i ograniczenie
"przepis wykorzystuje wyłącznie posiadane farby" pozostają dokładnie takie same.
Aplikacja nie podejmuje żadnej nowej decyzji obliczeniowej w ramach tej zmiany.

## Constraints & Preserved Behavior

- **Migracja danych:** istniejące wiersze w `recipes` (zapisane automatycznie przed tą
  zmianą) są traktowane jako już zapisane — pojawiają się na nowej liście zapisanych
  przepisów od pierwszego dnia, bez utraty danych.
- **Integracje zewnętrzne:** brak. `POST /api/recipe` jest używane wyłącznie przez własny
  frontend aplikacji — zmiana jego zachowania (przestaje trwale zapisywać automatycznie)
  nie wpływa na żadnego zewnętrznego konsumenta.
- **Zgodność wsteczna:** nie dotyczy w sensie API kontraktowego — to wewnętrzna zmiana
  zachowania własnej aplikacji, bez publicznego API do zachowania.

## Non-Functional Requirements

- Zapisanie, usunięcie i dodanie/edycja notatki dają użytkownikowi odczuwalnie szybką
  odpowiedź, spójną z resztą aplikacji.
- Pusta lista zapisanych przepisów pokazuje czytelny komunikat zamiast pustego ekranu.

## Non-Goals

- Sortowanie/filtrowanie listy zapisanych przepisów — lista jest płaska; przedwczesna
  optymalizacja przy małej skali i 3-dniowym budżecie (spójne z FR-003).
- Współdzielenie zapisanych przepisów z innymi użytkownikami — zapisane przepisy i
  notatki są prywatne, bez linków do udostępniania ani widoku publicznego.
- Kosz / przywracanie usuniętych przepisów — usunięcie jest trwałe i natychmiastowe,
  bez możliwości cofnięcia.
- Typ produktu i skala użytkowników — bez zmian względem M-1 (nadal web-app, nadal
  mała skala).

## Quality cross-check

Wszystkie elementy obecne, brak luk. Sesja shape zamknięta jako `accepted`.
