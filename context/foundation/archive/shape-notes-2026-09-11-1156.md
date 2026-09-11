---
project: "10xPaintMixer"
context_type: greenfield
created: 2026-09-06
updated: 2026-09-06
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "paraliż decyzyjny — użytkownik ma farby, ale nie wie jak zacząć mieszać / boi się zmarnować farbę"
    - topic: "insight"
      decision: "znane wzorce mieszania barw/pigmentów zastosowane do konkretnej, znanej puli farb użytkownika"
    - topic: "zasięg primary persony"
      decision: "hobbysta wargamingu / modelarstwa figurek"
    - topic: "model dostępu"
      decision: "logowanie email + hasło"
    - topic: "model ról"
      decision: "płaski — jedna rola użytkownik, bez ról administracyjnych w MVP"
    - topic: "kryterium sukcesu — secondary"
      decision: "odczuwalnie szybki czas generowania przepisu"
    - topic: "guardrails MVP"
      decision: "prywatność danych użytkownika; przepis tylko z posiadanych farb; generowanie kończy się w rozsądnym czasie"
    - topic: "typ produktu"
      decision: "web-app"
    - topic: "skala docelowa"
      decision: "small — tylko autor lub garstka użytkowników na start"
    - topic: "budżet czasowy"
      decision: "3 tygodnie MVP, praca po godzinach, brak twardego deadline'u (wstępnie podana data 2026-09-13 była błędem, skorygowano)"
  frs_drafted: 5
  quality_check_status: accepted
---

# Shape Notes — 10xPaintMixer

Seed idea (from idea-notes.md):

> Malowanie figurek ułatwia posiadanie dużej palety barw, ale ciężko fizycznie posiadać dużą ilość farbek pokrywającą całą paletę. Kolory można mieszać, jednak stworzenie konkretnego koloru z już dostępnej puli farb "na oko" jest trudne.

## Vision & Problem Statement

Hobbysta wargamingu / modelarstwa figurek, który posiada ograniczoną fizycznie paletę farb, staje przed konkretnym kolorem do pomalowania figurki, którego nie ma gotowego w swoim zestawie. Wie, że teoretycznie może go zmieszać z posiadanych farb, ale nie wie jak zacząć — brak pewności co do proporcji prowadzi do paraliżu decyzyjnego: albo rezygnuje z konkretnego koloru, albo eksperymentuje "na oko", ryzykując zmarnowanie farby i uzyskanie niespójnego rezultatu.

Istnieją znane modele mieszania barw/pigmentów, które pozwalają przewidzieć wynikowy kolor z określonych składników — nikt jednak nie połączył tego z konkretną, znaną pulą farb posiadanych przez użytkownika w prosty produkt, który podpowiada gotowy przepis na żądany kolor.

## User & Persona

Hobbysta wargamingu / modelarstwa figurek — osoba, która maluje figurki (np. do gier bitewnych typu Warhammer) i posiada własny, ograniczony zestaw farb. Sięga po produkt w momencie, gdy chce pomalować element konkretnym kolorem, którego fizycznie nie posiada, i potrzebuje wiedzieć, jak go zmieszać z tego, co ma.

## Access Control

Logowanie przez email + hasło. Płaski model ról — jedna rola "użytkownik" w MVP, bez ról administracyjnych. Każdy zalogowany użytkownik widzi i zarządza wyłącznie własną listą posiadanych farb oraz własnymi wygenerowanymi przepisami na kolory.

## Success Criteria

### Primary
- 75% przepisów na kolor wygenerowanych przez aplikację jest akceptowane przez użytkownika.

### Secondary
- Czas generowania przepisu jest odczuwalnie szybki dla użytkownika.

### Guardrails
- Dane (lista farb, przepisy) jednego użytkownika są prywatne — niewidoczne dla innych zalogowanych użytkowników.
- Wygenerowany przepis nigdy nie używa farby spoza listy farb zadeklarowanych przez użytkownika jako posiadane.
- Generowanie przepisu zawsze kończy się w rozsądnym czasie — użytkownik dostaje wynik lub czytelny błąd, nie nieograniczone oczekiwanie.

### Pierwsza sesja (MVP flow)
1. Użytkownik rejestruje się / loguje (email + hasło)
2. Użytkownik dodaje farby do swojej listy (wybierając z bazy dostępnych farb)
3. Użytkownik przegląda / edytuje / usuwa farby na swojej liście
4. Użytkownik wybiera docelowy kolor, który chce uzyskać
5. Aplikacja generuje przepis na mieszankę z posiadanych farb

## Functional Requirements

- FR-001: Użytkownik może założyć konto i zalogować się (email + hasło). Priority: must-have
  > Socrates: Brak kontrargumentu — zostaje bez zmian.
- FR-002: Użytkownik może dodać farbę do swojej listy, wybierając z bazy dostępnych farb. Priority: must-have
  > Socrates: Brak kontrargumentu — zostaje bez zmian.
- FR-003: Użytkownik może przeglądać swoją listę posiadanych farb. Priority: must-have
  > Socrates: Brak kontrargumentu — zostaje bez zmian.
- FR-004: Użytkownik może usunąć farbę ze swojej listy. Priority: must-have
  > Socrates: Rozważony kontrargument: "to trywialny CRUD — czy potrzebuje potwierdzenia?".
  > Rozstrzygnięcie: FR zostaje bez zmian; czy istnieje dialog potwierdzający to decyzja
  > projektowa/implementacyjna downstream, nie treść PRD.
- FR-005: Użytkownik może wybrać docelowy kolor z bazy dostępnych kolorów i otrzymać wygenerowany przepis na jego zmieszanie z posiadanych farb. Priority: must-have
  > Socrates: Rozważony kontrargument: "sposób wyboru docelowego koloru jest niedookreślony".
  > Rozstrzygnięcie: doprecyzowano — kolor docelowy wybierany jest z tej samej bazy kolorów
  > co farby (FR-002), bez definiowania kolorów niestandardowych.

> Socrates — FR-004 (edycja wpisu farby) usunięta z listy: rozważony kontrargument "edycja
> sprowadza się w praktyce do usunięcia i dodania innej farby". Rozstrzygnięcie: usunięta,
> pokryta przez FR-002 (dodaj) + FR-004 (usuń, po renumeracji).

## Business Logic

Aplikacja oblicza przepis (proporcje mieszania) potrzebny do uzyskania wybranego docelowego koloru z farb, które użytkownik faktycznie posiada.

Wejściami reguły są: lista posiadanych farb zadeklarowanych przez użytkownika oraz docelowy kolor wybrany z bazy dostępnych kolorów. Wyjściem jest przepis określający proporcje farb do zmieszania, aby uzyskać docelowy kolor lub jego najbliższe możliwe przybliżenie. Użytkownik napotyka wynik od razu po wybraniu koloru — to krok 4→5 przepływu MVP.

## Non-Functional Requirements

- Wynik generowania przepisu pojawia się dla użytkownika w ciągu kilku sekund od wyboru docelowego koloru.

## Non-Goals

- Generowanie listy wszystkich możliwych kombinacji kolorów — MVP generuje przepis na żądanie dla jednego wybranego koloru, nie eksploruje całej przestrzeni kombinacji.
- Dodawanie kolorów niestandardowych — w MVP farby i docelowe kolory pochodzą wyłącznie z bazy dostępnych kolorów, bez definiowania własnych.
- Import listy farb z pliku — lista farb budowana wyłącznie ręcznie przez użytkownika w MVP.
- Współdzielenie list farb z innymi użytkownikami — dane każdego użytkownika są prywatne i osobne.
- Aplikacje mobilne — MVP jest wyłącznie aplikacją webową na start.

## Quality cross-check

Wszystkie elementy obecne, brak luk. Sesja shape zamknięta jako `accepted`.

## User Stories

### US-01: Użytkownik generuje przepis na docelowy kolor

- **Given** zalogowany użytkownik z co najmniej jedną farbą na liście
- **When** wybiera docelowy kolor, który chce uzyskać
- **Then** otrzymuje wygenerowany przepis na zmieszanie tego koloru z farb, które posiada

#### Acceptance Criteria
- Przepis wykorzystuje wyłącznie farby zadeklarowane przez użytkownika jako posiadane
- Jeśli lista farb jest pusta, użytkownik widzi czytelny komunikat zamiast błędu lub pustego wyniku
