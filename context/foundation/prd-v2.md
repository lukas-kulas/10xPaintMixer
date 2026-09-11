---
project: "10xPaintMixer"
version: 2
status: draft
created: 2026-09-11
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: true
---

# PRD — 10xPaintMixer (v2: Zapisane przepisy)

## Current System Overview

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
  farb. Przepis jest przy tym już dziś cicho zapisywany do bazy, ale użytkownik nie ma
  żadnego sposobu, by go później zobaczyć, usunąć ani opisać notatką.

## Problem Statement & Motivation

Hobbysta, który wygenerował przepis, nie ma dziś żadnej możliwości wrócenia do niego
później — przepis znika z ekranu zaraz po wyświetleniu, mimo że w tle jest już zapisany.
W praktyce, podczas malowania figurki, użytkownik często wraca do przepisu wielokrotnie
(np. żeby domieszać więcej farby) i chciałby dopisać własne obserwacje (np. "za dużo
bieli, następnym razem mniej").

To świadomie odłożona luka, nie przeoczenie: PRD v1 skupił się wyłącznie na sprawdzeniu,
czy sam algorytm generowania trafia w oczekiwania użytkownika (kryterium sukcesu: 75%
akceptacji) — dodawanie historii i notatek przed potwierdzeniem tej hipotezy byłoby
przedwczesną optymalizacją. Teraz, gdy milestone M-1 jest zamknięty i podstawowy przepływ
generowania działa na produkcji, warto odblokować tę wartość.

## User & Persona

Bez zmian względem M-1: hobbysta wargamingu/modelarstwa figurek, zalogowany przez
email + hasło, zarządza wyłącznie własnymi danymi. Ta zmiana nie wprowadza nowej persony
ani nie zmienia modelu dostępu.

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

## Scope of Change

- [new] Użytkownik może zapisać wygenerowany przepis z widoku `/dashboard/recipe`.
  > Socrates: Rozważony kontrargument: "przycisk 'Zapisz' to dodatkowe tarcie tuż po
  > zobaczeniu wyniku, może obniżyć konwersję". Rozstrzygnięcie: FR zostaje bez zmian —
  > wyraźny, świadomy akt zapisu jest zgodny z ustaloną semantyką "Zapisz = trwały zapis";
  > tarcie jest akceptowalnym kosztem za kontrolę użytkownika nad tym, co zachowuje.
- [modified] Wygenerowanie przepisu — dotychczas: każde wygenerowanie automatycznie
  zapisywało przepis na trwałe; teraz: trwały zapis następuje wyłącznie po wyraźnym
  kliknięciu „Zapisz".
  > Socrates: Rozważony kontrargument: "zmiana koliduje z metryką sukcesu PRD v1 (75%
  > akceptacji)". Rozstrzygnięcie: FR zostaje bez zmian — metryka nigdy nie była mierzona
  > liczbą zapisanych przepisów (nie ma dziś żadnego UI do tego), to był wyłącznie efekt
  > uboczny implementacji, nie sygnał biznesowy; zmiana jest bezpieczna.
- [new] Użytkownik może przeglądać listę swoich zapisanych przepisów na nowej zakładce.
  > Socrates: Rozważony kontrargument: "brak sortowania/filtrowania może czynić listę
  > bezużyteczną przy wielu wpisach". Rozstrzygnięcie: FR zostaje bez zmian, sortowanie/
  > filtrowanie poza zakresem — przy małej skali i krótkim budżecie czasowym to
  > przedwczesna optymalizacja; do rozważenia w kolejnej iteracji.
- [new] Użytkownik może usunąć zapisany przepis ze swojej listy.
  > Socrates: Rozważony kontrargument: "usunięcie bez potwierdzenia grozi przypadkową,
  > nieodwracalną utratą przepisu i notatki". Rozstrzygnięcie: FR zostaje bez zmian; czy
  > istnieje dialog potwierdzający to decyzja projektowa/implementacyjna downstream, nie
  > treść PRD — spójne z precedensem usuwania farby w M-1.
- [new] Użytkownik może dodać notatkę do zapisanego przepisu i później ją edytować (jedno
  edytowalne pole).
  > Socrates: Rozważone dwa kontrargumenty: (1) "czy notatka jest opcjonalna przy
  > zapisie?" — Rozstrzygnięcie: notatka jest opcjonalna, dodawana później z widoku
  > listy, "Zapisz" sam w sobie nie wymaga notatki. (2) "dodawanie i edycja notatki to
  > osobne FR-y?" — Rozstrzygnięcie: scalone w jeden FR, spójnie z precedensem z M-1
  > (edycja farby odrzucona jako osobny FR) — to jedno edytowalne pole, nie dwie zdolności.
- [preserved] Przepływ wyboru docelowego koloru i wynik algorytmu generowania (proporcje,
  jakość dopasowania) działają dokładnie tak jak dziś.
  > Socrates: Rozważony kontrargument: "koliduje ze zmianą zapisu — granica 'co się
  > zmienia' jest niejasna". Rozstrzygnięcie: doprecyzowano — ten punkt dotyczy WYŁĄCZNIE
  > wyboru koloru i wyniku algorytmu (użytkownik widzi identyczny wynik jak dziś); zmiana
  > zapisu dotyczy WYŁĄCZNIE trwałości zapisu tego wyniku. Rozłączne zakresy.

## Constraints & Compatibility

- **Migracja danych:** wszystkie dotychczas wygenerowane przepisy (zapisane automatycznie
  przed tą zmianą) są traktowane jako już zapisane — pojawiają się na nowej liście
  zapisanych przepisów od pierwszego dnia, bez utraty danych.
- **Integracje zewnętrzne:** brak zewnętrznych konsumentów przepływu generowania poza
  własnym frontendem aplikacji; zmiana zachowania zapisu (przestaje być automatyczne) nie
  wpływa na żadnego zewnętrznego konsumenta.
- **Zgodność wsteczna:** nie dotyczy w sensie zewnętrznego kontraktu — to wewnętrzna
  zmiana zachowania własnej aplikacji, bez publicznego kontraktu do zachowania.

## Business Logic Changes

No domain logic change. To rozszerzenie zakresu CRUD (trwały zapis, usuwanie, notatki) —
istniejąca reguła mieszania kolorów i ograniczenie "przepis wykorzystuje wyłącznie
posiadane farby" pozostają dokładnie takie same. Aplikacja nie podejmuje żadnej nowej
decyzji obliczeniowej w ramach tej zmiany.

## Access Control Changes

No access control changes — current model preserved. Logowanie email + hasło pozostaje
bez zmian; płaski model ról (jedna rola „użytkownik", bez ról administracyjnych) pozostaje
bez zmian. Zapisane przepisy i notatki dziedziczą dokładnie ten sam model własności co
reszta danych użytkownika: wyłącznie użytkownik, który wygenerował dany przepis, może go
widzieć, edytować notatkę i usunąć.

## Non-Goals

- Sortowanie/filtrowanie listy zapisanych przepisów — lista jest płaska; przedwczesna
  optymalizacja przy małej skali i krótkim budżecie czasowym.
- Współdzielenie zapisanych przepisów z innymi użytkownikami — zapisane przepisy i
  notatki są prywatne, bez linków do udostępniania ani widoku publicznego.
- Kosz / przywracanie usuniętych przepisów — usunięcie jest trwałe i natychmiastowe, bez
  możliwości cofnięcia.
- Zmiana typu produktu lub skali użytkowników — bez zmian względem M-1 (nadal web-app,
  nadal mała skala).

## Open Questions

No outstanding gaps identified. The shaping session's closing quality cross-check
(`quality_check_status: accepted`, recorded in `shape-notes.md`) confirmed all required
elements were present before this PRD was generated.
