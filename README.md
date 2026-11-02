# icedrive-music-extension

Extension for Firefox/Chrome browsers that let you control more aspects of music player inside Icedrive.

Rozszerzenie do Chrome/Brave (później także Firefox), które dodaje do odtwarzacza muzyki w [Icedrive](https://icedrive.net) brakujące funkcje: informacje o utworze, przewijanie, przejście do następnego/poprzedniego, tryb shuffle i loop.

Zbudowane na [WXT](https://wxt.dev) + TypeScript, Manifest V3.

## Status

- [x] **Krok 1:** szkielet, odczyt stanu odtwarzacza Icedrive, sterowanie (play/pauza, przewijanie, następny/poprzedni), automatyczne przejście do kolejnego utworu po zakończeniu
- [x] **Krok 2:** pełny popup z okładką, paskiem przewijania i listą utworów
- [x] **Krok 3:** shuffle i loop (utwór / cały folder), zapamiętywanie ustawień
- [x] **Krok 4:** klawisze multimedialne (Media Session API), skróty klawiszowe

## Instalacja (tryb deweloperski)

Wymagany Node.js 20+.

```bash
npm install
npm run build
```

1. Otwórz `chrome://extensions` (w Brave: `brave://extensions`).
2. Włącz **Tryb dewelopera**.
3. Kliknij **Załaduj rozpakowane** i wskaż folder `.output/chrome-mv3`.
4. Odśwież kartę z Icedrive.

Podczas pracy nad kodem `npm run dev` uruchamia przeglądarkę z wtyczką i przeładowuje ją przy każdej zmianie.

## Przyciski w odtwarzaczu Icedrive i okno odpięte

- Pod odtwarzaczem Icedrive pojawiają się przyciski **losowo**, **poprzedni**, **następny** i **powtarzanie**. Play, przewijanie i głośność zostają w samym odtwarzaczu Icedrive. Ustawienia są wspólne z popupem.
- Przycisk ↗ w rogu popupu otwiera go jako **małe osobne okno**, które zostaje otwarte, gdy klikasz gdzie indziej. W tym oknie lista utworów wykorzystuje całą wysokość. Ponowne kliknięcie przenosi do już otwartego okna zamiast tworzyć nowe.

## Klawisze multimedialne i skróty

Klawisze multimedialne na klawiaturze i słuchawkach (play/pauza, następny, poprzedni) działają, gdy gra muzyka z Icedrive. Tytuł, wykonawca i okładka pojawiają się też w panelu multimediów Chrome/Brave oraz w nakładce systemowej Windows/macOS, gdzie również można przewijać.

Skróty wtyczki działają z każdej karty:

| Skrót | Działanie |
| --- | --- |
| `Alt+Shift+Spacja` | odtwórz / pauza |
| `Alt+Shift+.` | następny utwór |
| `Alt+Shift+,` | poprzedni utwór |
| `Alt+Shift+S` | losowo włącz / wyłącz |

Skróty zmienisz w `chrome://extensions/shortcuts` (w Brave `brave://extensions/shortcuts`). Tam możesz też ustawić je jako „globalne”, żeby działały, gdy przeglądarka jest w tle. W popupie spacja włącza i wyłącza odtwarzanie.

## Jak to działa

Icedrive odtwarza muzykę w oknie podglądu (`#preview`) przy użyciu Plyr. Wtyczka:

- `lib/icedrive-dom.ts` zna strukturę strony Icedrive (jedyne miejsce do poprawy, jeśli Icedrive zmieni HTML),
- `entrypoints/icedrive.content.ts` czyta stan odtwarzacza i wykonuje polecenia z popupu,
- `lib/queue.ts` ustala kolejność odtwarzania: po kolei albo losowo (każdy utwór raz, „poprzedni” wraca do faktycznie słuchanego), z powtarzaniem wyłączonym, całego folderu albo jednego utworu. Ustawienia są zapisywane w `storage.local`,
- `lib/media-session.ts` łączy odtwarzacz z Media Session API (klawisze multimedialne, panel multimediów, nakładka systemowa),
- `lib/in-page-controls.ts` dokleja przyciski pod odtwarzacz Icedrive (w shadow DOM, więc style się nie mieszają) i dodaje je ponownie, gdy Icedrive przebuduje odtwarzacz dla nowego utworu,
- `entrypoints/background.ts` obsługuje skróty klawiszowe i przekazuje je do karty Icedrive, która gra,
- `entrypoints/icedrive-bridge.content.ts` działa w kontekście strony i wywołuje funkcję Icedrive `previewItem()`, żeby otworzyć inny plik z folderu,
- `lib/validate.ts` sprawdza w czasie działania każdą wiadomość, ustawienie i adres, który przychodzi spoza danego skryptu,
- `entrypoints/popup/` to okienko pod ikoną wtyczki: okładka, tytuł, wykonawca, pasek przewijania, sterowanie i lista utworów (kliknięcie odtwarza; spacja = play/pauza).

## Bezpieczeństwo i komputer służbowy

Wtyczka działa tylko na `icedrive.net`, ma jedno uprawnienie (`storage`), nie wysyła żadnych danych, nie ładuje kodu z sieci i ma ścisłe CSP. Szczegóły i zgłaszanie podatności: [SECURITY.md](SECURITY.md). Instalacja na laptopie firmowym (polityki Chrome/Brave, co przekazać działowi IT): [docs/enterprise-install.md](docs/enterprise-install.md).

## Skrypty

| Polecenie | Co robi |
| --- | --- |
| `npm run dev` | tryb deweloperski z hot reload |
| `npm run build` | build do `.output/chrome-mv3` |
| `npm run zip` | paczka `.zip` do sklepu Chrome Web Store |
| `npm test` | testy (Vitest) |
| `npm run compile` | sprawdzenie typów TypeScript |
| `npm run check:security` | sprawdza gotowy build: uprawnienia, CSP, brak `eval`/`innerHTML`/zewnętrznych adresów |
| `npm run verify` | wszystko naraz: typy, testy, build, kontrola bezpieczeństwa, `npm audit` |

## Znane ograniczenia

- Muzyka gra tylko, gdy okno podglądu Icedrive jest otwarte. Zamknięcie podglądu zatrzymuje odtwarzanie (tak działa Icedrive).
- Kolejka to pliki audio z aktualnie otwartego folderu, w kolejności sortowania w Icedrive.
