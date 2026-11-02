# icedrive-music-extension

Extension for Firefox/Chrome browsers that let you control more aspects of music player inside Icedrive.

Rozszerzenie do Chrome/Brave (później także Firefox), które dodaje do odtwarzacza muzyki w [Icedrive](https://icedrive.net) brakujące funkcje: informacje o utworze, przewijanie, przejście do następnego/poprzedniego, tryb shuffle i loop.

Zbudowane na [WXT](https://wxt.dev) + TypeScript, Manifest V3.

## Status

- [x] **Krok 1:** szkielet, odczyt stanu odtwarzacza Icedrive, sterowanie (play/pauza, przewijanie, następny/poprzedni), automatyczne przejście do kolejnego utworu po zakończeniu
- [ ] **Krok 2:** pełny popup z okładką, paskiem przewijania i listą utworów
- [ ] **Krok 3:** shuffle i loop (utwór / cały folder), zapamiętywanie ustawień
- [ ] **Krok 4:** klawisze multimedialne (Media Session API), skróty klawiszowe

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

## Jak to działa

Icedrive odtwarza muzykę w oknie podglądu (`#preview`) przy użyciu Plyr. Wtyczka:

- `lib/icedrive-dom.ts` zna strukturę strony Icedrive (jedyne miejsce do poprawy, jeśli Icedrive zmieni HTML),
- `entrypoints/icedrive.content.ts` czyta stan odtwarzacza i wykonuje polecenia z popupu,
- `entrypoints/icedrive-bridge.content.ts` działa w kontekście strony i wywołuje funkcję Icedrive `previewItem()`, żeby otworzyć inny plik z folderu,
- `entrypoints/popup/` to okienko pod ikoną wtyczki.

## Skrypty

| Polecenie | Co robi |
| --- | --- |
| `npm run dev` | tryb deweloperski z hot reload |
| `npm run build` | build do `.output/chrome-mv3` |
| `npm run zip` | paczka `.zip` do sklepu Chrome Web Store |
| `npm test` | testy (Vitest) |
| `npm run compile` | sprawdzenie typów TypeScript |

## Znane ograniczenia

- Muzyka gra tylko, gdy okno podglądu Icedrive jest otwarte. Zamknięcie podglądu zatrzymuje odtwarzanie (tak działa Icedrive).
- Kolejka to pliki audio z aktualnie otwartego folderu, w kolejności sortowania w Icedrive.
