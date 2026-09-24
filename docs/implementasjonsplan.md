# Rombooking – implementasjonsplan (proof of concept)

Status: utkast, 24.09.2026. Målet er en klikkbar, men ekte, WordPress-plugin i dette repoet
(`tbg-roombooking`), bygget etter konvensjonene i `creo-wp` slik at den senere kan flyttes inn der som en ny pakke.

---

## 1. Kildegrunnlag og tilgang

| Kilde | Tilgang | Hva vi fikk |
|---|---|---|
| Prototype (claude.ai-artifact, «Rombooking for menigheten») | ✅ Lest | Tre tegnebrett: `Main` (medlem, dag/uke + skjema, 1100 px), `Mobile` (360 px), `Admin` (forespørsler/konflikter, 1100 px). Eksempeldata, statusmodell, tekster og tastaturhjelp. |
| `creo-wp` (via `akselkvitberg/creo-wp-fork`) | ✅ Klonet | Konvensjoner, byggeverktøy, temaet `creo` og pluginen `creo-blocks` (se §2). |

**Designvalg:** Vi bruker **creo-temaets eget design** (Tailwind-oppsett, fargepalett, `.button`, skjemastiler, Archivo,
mørk modus), **ikke** BCC-designsystemet. Prototypens aksentfarge `#0c625c` og Archivo ligger allerede tett på
creo-paletten (`dark-green` `#004e48`, `light-green`, `warm-gray`, `rust`, `glacier`).

---

## 2. Hva creo-wp legger føringer for

| Område | creo-wp-konvensjon | Konsekvens for rombooking |
|---|---|---|
| Repo | pnpm 9-monorepo, `packages/*` = tema/plugins, `tools/scripts` = felles webpack/Tailwind/PostCSS | Ny pakke `packages/creo-rombooking` |
| Bygg | `@wordpress/scripts` (webpack) via `@creo-wp/scripts`, TypeScript `strict`, `.pcss` + Tailwind **3** | Samme oppsett; ingen Vite |
| JS-rammeverk | React 18 via `@wordpress/element` (editor), Alpine.js i temaets frontend | **React + TypeScript** via `@wordpress/element` (lastes som WP-avhengighet, ingen ekstra bundlekostnad) |
| CSS | Temaet har Tailwind base/preflight; `creo-blocks` bygger bare `@tailwind utilities`. Temaets CSS renses (purge) mot egne filer, så pluginen kan **ikke** låne temaets utility-klasser | Egen Tailwind-bygg med bare `utilities` + komponenter, basert på `@creo-wp/scripts/tailwind.config.js`. Farger via `var(--wp--preset--color--*)`, som følger temaets «Primary color»-innstilling |
| Mørk modus | `darkMode: 'class'` (`html.dark`), bryter i menyen | Alle komponenter får `dark:`-varianter |
| PHP | Ingen Composer-autoload; `includes/class-*.php` + `helpers.php`, WordPress Coding Standards (PHPCS), PHP ≥ 8.2, WP ≥ 6.4 | Samme struktur. Prefiks `creo_rombooking` legges til i `.phpcs.xml` |
| Oppdatering/release | Hver pakke zippes av `bin/create-release-assets.js`; `includes/updater.php` sjekker `creo-wp.creoweb.no/<pakke>.json` | Kopier updater-mønsteret fra `creo-blocks`; pakken blir med i release automatisk |
| i18n | Engelske kildestrenger + `languages/nb_NO.po` (også fr_FR, nl_NL, pl_PL) | Samme: engelske kildestrenger, `nb_NO` levert i PoC-en |
| Test/CI | PHPUnit 9 i `wp-env tests-cli`, ESLint/tsc/Stylelint/PHPCS i GitHub Actions | Samme verktøy; i tillegg Playwright + axe for tilgjengelighet |
| Innlogging | `bcc-login` (valgfri) via `creo_has_bcc_login()` | Brukere er alltid innlogget; ikke innlogget → innloggingsmelding/lenke |
| Innholdsbredde | `theme.json`: `contentSize` 768 px, `wideSize` 1280 px | Blokken/shortcoden bruker `alignwide`, og appen begrenser seg selv til maks 1100 px |

---

## 3. Hva prototypen dekker – og hva som mangler

| # | Skjerm | I prototypen |
|---|---|---|
| 1 | Matrise, dagvisning | ✅ rom × 28 halvtimesluker 08–22, legend, datovelger, «I dag», dag/uke-bryter, tastaturhjelp |
| 2 | Matrise, ukevisning | ✅ (i `Main`) |
| 3 | Mobil 360 px | ✅ romvelger + vertikal tidsliste |
| 4 | Bookingskjema | ✅ forhåndsutfylt, validering, «opptatt → sendes til admin», gjentakelse + forhåndsvisning (Ledig / Konflikt / Utenfor åpningstid) |
| 5 | Mine bookinger | ❌ må designes (avbestilling «denne»/«denne og alle senere», kort for alternativt forslag med Aksepter/Avslå + svarfrist) |
| 6 | Admin-innboks | ✅ konflikter øverst, side om side, forslag til ledige rom, serie-handlinger, tomtilstand |
| 7 | Admin-matrise med dra-og-slipp | ❌ må designes (inkl. tastaturalternativ til dra) |
| 8 | Rom-oppsett | ❌ må designes |
| 9 | Avbestilling fra admin | 🟡 finnes som del av konfliktflyten («Godkjenn og avbestill»); trenger frittstående variant |

Eksempeldataene fra prototypen (oppdiktede navn, rom, åpningstider, unntak) gjenbrukes som seed-data.
Statusfargene hentes fra creo-paletten og kontrastsjekkes i både lys og mørk modus.

---

## 4. Arkitektur

### 4.1 Repo-oppsett for PoC-en
`tbg-roombooking` settes opp som en minimal kopi av creo-wp-strukturen, slik at pakken kan flyttes uendret:

```
tbg-roombooking/
├── package.json, pnpm-workspace.yaml, tsconfig.json, .eslintrc, .phpcs.xml, .wp-env.json  # som i creo-wp
├── tools/scripts/                    # kopi av @creo-wp/scripts (webpack/Tailwind/PostCSS-grunnoppsett)
├── vendor-theme/creo-wp/             # git-submodul → creo-wp-fork, slik at wp-env kjører det ekte creo-temaet
├── bin/                              # wp-env-oppsett, bygging av temaet, php-server.sh (uten Docker)
├── packages/creo-rombooking/
│   ├── creo-rombooking.php           # plugin-header, konstanter, require av includes
│   ├── includes/
│   │   ├── helpers.php               # creo_rombooking_register_entry() m.m.
│   │   ├── updater.php               # som i creo-blocks
│   │   ├── class-creo-rombooking.php                # bootstrap, hooks, roller/capabilities
│   │   ├── class-creo-rombooking-schema.php         # dbDelta-tabeller + versjonsmigrering
│   │   ├── class-creo-rombooking-availability.php   # statusberegning, åpningstider, unntak
│   │   ├── class-creo-rombooking-recurrence.php     # serier og forekomster
│   │   ├── class-creo-rombooking-rest.php           # REST-ruter under creo-rombooking/v1
│   │   ├── class-creo-rombooking-notifier.php       # SMS-grensesnitt + logg-implementasjon
│   │   └── class-creo-rombooking-block.php          # blokk + shortcode som monterer appen
│   ├── src/
│   │   ├── public.tsx                # monterer React-appen på .creo-rombooking-elementet
│   │   ├── style.pcss                # @tailwind utilities + komponentstiler
│   │   ├── api/                      # typet klient mot REST (apiFetch fra @wordpress/api-fetch)
│   │   ├── components/matrix/        # DayMatrix, WeekMatrix, MobileDayList, StatusCell, Legend
│   │   ├── components/booking/       # BookingForm, RecurrencePreview
│   │   ├── views/                    # MyBookings, AdminInbox, AdminMatrix, RoomSetup
│   │   └── lib/                      # dato/tid (nb-NO), tastaturnavigasjon (roving tabindex)
│   ├── languages/
│   └── package.json, webpack.config.js, tailwind.config.js, postcss.config.js
└── tests/phpunit/creo-rombooking/, e2e/ (Playwright + axe)
```

Flytting til creo-wp = kopiere `packages/creo-rombooking` og testene, legge prefiks og text domain inn i `.phpcs.xml`,
og legge pluginen til `option_active_plugins` i `tests/phpunit/bootstrap.php`.

### 4.2 Frontend
- React 18 + TypeScript via `@wordpress/element`, `@wordpress/api-fetch` og `@wordpress/i18n` (alle eksterne WP-skript).
- Ingen tunge UI-biblioteker. Egne, små komponenter: dialog (native `<dialog>` + fokusstyring), segmentert bryter,
  statuscelle, toast/`role="status"`. Knapper og skjemafelt følger temaets `.button`/`form.pcss`-stil, men klassene
  bygges i pluginens egen CSS (temaets klasser er purget).
- Matrisen scroller horisontalt internt med klebrig romkolonne. Under ~640 px byttes til mobilvisning (ett rom om gangen).
- Monteres via blokken `creo-rombooking/app` (med shortcode `[creo_rombooking]` som alternativ). **Admin-skjermene
  ligger på nettsiden, i den samme appen**, og vises bare for brukere med `creo_rombooking_manage` (fanene
  «Forespørsler», «Matrise» og «Rom»). Ingen wp-admin-sider utover det WordPress trenger.
- **Språk:** engelske kildestrenger via `@wordpress/i18n`/`__()` med text domain `creo-rombooking`, og
  `languages/nb_NO.po`. PoC-en leverer bare norsk bokmål.

### 4.3 Backend (WordPress)
- **Roller:** `medlem` = innlogget bruker med **medlemskap** fra `bcc-login` (rollen `bcc-login-member`), gitt
  capability `creo_rombooking_book`. `admin` = `creo_rombooking_manage` (administrator + evt. egen rolle «Romansvarlig»).
  Oppslaget ligger bak én funksjon (`creo_rombooking_is_member()`), så kilden kan byttes uten å røre resten.
  Uten `bcc-login` (lokal utvikling) regnes alle innloggede brukere som medlemmer.
- **Telefonnummer:** antas å ligge som claim i tokenet fra `bcc-login` (f.eks. OIDC-standarden `phone_number`).
  Leses bak `creo_rombooking_get_phone( $user_id )`. Finnes det ikke, viser bookingskjemaet feltet
  «Legg inn telefonnummer» (påkrevd, valideres som norsk mobilnummer); nummeret lagres i brukermeta og gjenbrukes.
  Må verifiseres mot et ekte token (se åpne spørsmål).
- **Personvern i API-et:** endepunktene for medlemmer returnerer aldri navn eller formål på andres bookinger – bare
  status (`free|busy|requested|closed|mine`). Dette håndheves på serveren, ikke bare i grensesnittet.
- **SMS:** `Notifier`-grensesnitt. PoC-en bruker en logg-implementasjon (lagres i hendelsesloggen og vises for admin).
  Ekte leverandør kobles på senere.
- **Tid:** `wp_timezone()`. Lagring som lokal dato + minutter; visning på norsk.

### 4.4 Datamodell (egne tabeller, `{prefix}creo_rombooking_*`)
| Tabell | Nøkkelfelt |
|---|---|
| `rooms` | id, navn, beskrivelse, kapasitet, bilde (attachment_id), aktiv, godkjenning (`auto`/`manuell`), rominstruks, sortering |
| `opening_hours` | room_id, ukedag, fra, til (flere intervaller per dag tillatt) |
| `closures` | room_id, dato, fra?, til?, type (`stengt`/`sperret`), begrunnelse |
| `series` | id, user_id, room_id, regel (`weekly`/`biweekly`/`monthly`), start, sluttdato eller antall |
| `bookings` | id, series_id?, room_id, user_id, dato, fra, til, formål (≤ 200 tegn), antall personer, status (`requested`/`approved`/`rejected`/`cancelled`), konflikt_med?, opprettet |
| `proposals` | id, booking_id, foreslått rom/dato/fra/til, melding, svarfrist, status (`pending`/`accepted`/`declined`/`expired`) |
| `events` (logg) | booking_id, aktør, handling, begrunnelse, sms_tekst, tidspunkt |

Regler: 30-minuttersluker. Overlapp sjekkes mot `approved`, og `requested` vises som «Forespurt». Rom med
autogodkjenning godkjennes straks hvis tiden er ledig, ellers blir forespørselen `requested` med konflikt.
Forekomster «Utenfor åpningstid» utelates fra serier. Utløpte forslag ryddes med WP-Cron.

### 4.5 REST API (`/wp-json/creo-rombooking/v1`, `wp_rest`-nonce + capability-sjekk)
- `GET rooms` · `GET availability?from=&to=&rooms=` (maks 14 dager). Svaret har én liste med perioder per rom og dag,
  der like nabo-luker er slått sammen (`{start, end, status}`, minutter etter midnatt). Status er `free`, `busy`,
  `requested`, `closed` (med årsak: utenfor åpningstid, stengt eller sperret), `mine` og `mine-requested`. Ved overlapp gjelder
  prioriteten stengt > din booking > opptatt > din forespørsel > forespurt > ledig. Medlemmer ser aldri navn eller formål på
  andres bookinger, heller ikke administratorer i medlemsvisningen.
- `POST bookings/preview` (forekomster med Ledig/Konflikt/Utenfor) · `POST bookings`
- `GET me/bookings` · `POST me/bookings/{id}/cancel` (`scope=this|following`) · `POST me/proposals/{id}/accept|decline` (fase 6)
- Admin (alle under `admin/`, krever `creo_rombooking_manage`):
  - `GET admin/requests`: konflikter, serier, til godkjenning, med eksisterende booking, forslag til ledige rom med nok
    plass og rom den eksisterende bookingen kan flyttes til (fase 4)
  - `POST admin/requests/{id}/approve|reject|propose|move-existing|approve-and-cancel-existing` (fase 4)
  - `POST admin/series/{id}/approve-free|reject-rest` (fase 4)
  - `POST admin/bookings/{id}/cancel` (påkrevd begrunnelse, valgfritt forslag om annet rom) (fase 4)
  - `GET admin/check?roomId=&date=&start=&end=&ignore=` (er rommet ledig?) · `GET admin/sms-log?page=` (fase 4)
  - `GET admin/availability` (samme perioder, med navn og formål) · `POST admin/bookings/{id}/move` (flytt rom/dato/tid, fase 7)
  - `GET|POST admin/rooms` · `POST admin/rooms/{id}` · `POST admin/rooms/order` · `POST admin/rooms/{id}/closures` · `DELETE admin/rooms/{id}/closures/{closure}` (fase 8)

---

## 5. Tilgjengelighet (WCAG 2.1 AA)
- Matrisen er en `role="grid"` med rad- og kolonneoverskrifter og *roving tabindex*: piltaster, Home/End,
  PageUp/PageDown (forrige/neste dag), Enter/Space åpner skjemaet. Hver celle har et tilgjengelig navn,
  f.eks. «Møterom 1, 12:00–12:30, Ledig».
- Status vises med **farge + ikon + tekst/mønster** (f.eks. skravur for Stengt). Kontrast ≥ 4.5:1 for tekst og
  ≥ 3:1 for UI-grenser, sjekket mot creo-paletten i lys og mørk modus.
- Dra-og-slipp i admin-matrisen har et tastaturalternativ («Flytt …» → velg rom/tid) med `aria-live`-kunngjøring.
- Dialoger: fokusfelle, Esc lukker, fokus tilbake til cellen som åpnet dialogen. Feilmeldinger kobles med
  `aria-describedby`, med feiloppsummering øverst («Rett opp før du sender»).
- Bekreftelser og tomtilstander bruker `role="status"` («Bookingen er godkjent. Du får SMS.», «Ingen forespørsler venter»).
- Automatisk test: axe-core i Playwright på alle skjermer, i 1100 px og 360 px, lys og mørk modus. I tillegg manuell
  sjekk med skjermleser (NVDA/VoiceOver).

---

## 6. Lokal utvikling og testing

### 6.1 Kom i gang
```bash
git clone --recurse-submodules <repo>/tbg-roombooking
pnpm install
pnpm wp-env start      # WordPress på localhost:8888, testinstans på :8889
pnpm dev               # bygger og følger endringer, med automatisk oppdatering i nettleseren
```
Oppsettskriptet som kjører når `wp-env` starter (som `bin/wp-env-setup.js` i creo-wp):
- bygger creo-temaet fra submodulen (byggmappen ligger ikke i git)
- aktiverer temaet og pluginen, og lager siden «Rombooking» med blokken
- legger inn eksempeldata fra prototypen: rom, åpningstider, unntak, bookinger, forespørsler og konflikter

Tilbakestill dataene når som helst med `pnpm wp creo-rombooking seed --reset`.

### 6.2 Testbrukere
Lokalt finnes verken `bcc-login` eller tokens, så oppsettet lager faste brukere:

| Bruker | Rolle | Telefon |
|---|---|---|
| `admin` / `password` | admin | har nummer |
| `medlem` / `password` | medlem | har nummer (simulerer nummer fra tokenet) |
| `medlem-uten-tlf` / `password` | medlem | mangler → feltet «Legg inn telefonnummer» vises |
| `gjest` / `password` | innlogget, ikke medlem | får beskjed om manglende tilgang |

Nummeret «fra tokenet» leses lokalt fra brukermeta, slik at begge variantene kan testes uten ekte innlogging.
Ekte `bcc-login` kan kobles på med OIDC-nøkler i `.wp-env.override.json`, som i creo-wp.

### 6.3 SMS
Ingen SMS sendes lokalt. Meldingene lagres i hendelsesloggen og kan leses i fanen «SMS-logg» (admin) eller med
`pnpm wp creo-rombooking sms-log`.

### 6.4 Tester
| Nivå | Verktøy | Kommando | Dekker |
|---|---|---|---|
| PHP | PHPUnit 9 i `wp-env` (som creo-wp) | `pnpm test:php` | ledighet (åpningstider, unntak, overlapp), serier, konflikthåndtering, rettigheter, at navn ikke lekker til medlemmer |
| JS-enhetstester | `wp-scripts test-unit-js` (Jest) | `pnpm test:js` | dato/tid, forhåndsvisning av serier, tastaturnavigasjon |
| Ende-til-ende + tilgjengelighet | Playwright + axe-core mot testinstansen (:8889) | `pnpm test:e2e` | alle skjermer i 1100 px og 360 px, lys og mørk modus, «book → admin godkjenner → SMS i loggen», tastatur, WCAG-sjekk |
| Kodestil | PHPCS, ESLint, tsc, Stylelint (creo-wp-reglene) | `pnpm lint` | — |

**CI (GitHub Actions):** kodestil- og typesjekkene fra creo-wp, pluss en jobb som starter `wp-env` og kjører PHPUnit og
Playwright. Skjermbilder og axe-rapport legges ved som artefakter.

### 6.5 Uten Docker-bygg (Claude-sesjoner i skyen)
`bin/php-server.sh` starter PHPs server med fire arbeidsprosesser (`PHP_CLI_SERVER_WORKERS`), slik at WordPress sine
kall til seg selv (f.eks. WP-Cron) ikke venter på siden som startet dem. Docker kan startes med `dockerd`, og images hentes via registry-speilet `mirror.gcr.io` (Docker Hub gir 429 herfra).
`wp-env` fungerer likevel ikke her: images bygges med `apk update` over HTTPS, og byggcontainerne når verken
sesjonens proxy eller stoler på dens sertifikat. Derfor finnes `bin/php-server.sh`, som kjører WordPress med PHPs
innebygde server mot MySQL (f.eks. `mysql:8`-containeren), med samme oppsettskript og eksempeldata.
PHPUnit kjøres i en `php:8.2-cli`-container med `--network host` (PHPUnit 9.6 fra creo-wp sin lockfil gir
deprecation-feil på PHP 8.4). Lokalt og i CI brukes vanlig `wp-env` / oppsettet fra creo-wp.

---

## 7. Faser

Rekkefølgen følger bestillingen: matrise i dagvisning (desktop og mobil) og skjema først, deretter admin-innboksen.

| Fase | Innhold | Ferdig når |
|---|---|---|
| **0. Oppsett** | creo-wp-lik monorepo, creo-temaet som submodul i wp-env, pakken `creo-rombooking` med webpack/Tailwind/TS, PHPCS/ESLint/tsc/PHPUnit, CI, seed-data fra prototypen | Tom app vises via blokk i creo-temaet (lys og mørk modus) uten å endre temaets stil |
| **1. Domene + API (lesing)** | Tabeller, `Availability`, `GET rooms/availability` med personvernfiltrering | PHPUnit-tester for statusberegning (åpningstid, unntak, overlapp) |
| **2. Matrise dag + mobil** (skjerm 1, 3) | DayMatrix, StatusCell, Legend, datovelger, dag/uke-bryter, tastaturnavigasjon, MobileDayList | Klikk/Enter på celle åpner skjema; axe uten feil |
| **3. Bookingskjema** (skjerm 4) | BookingForm, validering, `Recurrence` + `preview`, melding om auto/manuell godkjenning, «opptatt → til admin», telefonnummerfelt når nummer mangler, bekreftelse | Booking lagres og vises som «Din booking»/«Forespurt» |
| **4. Admin-innboks** (skjerm 6, 9) | Forespørsler med konflikter øverst, side om side, forslag til ledige rom, alle fire handlinger, serie-handlinger, avbestillingsdialog med påkrevd begrunnelse, SMS-logg | Alle flytene i prototypen fungerer mot ekte data |
| **5. Ukevisning** (skjerm 2) | WeekMatrix med blokker, ett rom om gangen (romvelger), dagene som kolonner, tastatur (opp/ned i dagen, venstre/høyre mellom dager, Page Up/Down bytter uke) | Mobil: sideveis rulling i gridet, valgt dag i synsfeltet |
| **6. Mine bookinger** (skjerm 5) | Forslag som venter på svar (Aksepter/Avslå + svarfrist), kommende bookinger og forespørsler (serier samlet), avslått/avbestilt siste 30 dager med begrunnelse, avbestilling «denne» eller «denne og alle senere», også fra matrisen | Designet i fase 6 i samme stil som admin-innboksen (mangler i prototypen) |
| **7. Admin-matrise** (skjerm 7) | Fanen «Oversikt»: dagvisning med navn i cellene (navn, formål og antall i skjermlesernavnet), dra en booking til annet rom/tid (markør viser ny starttid), tastaturalternativ via bookingens detaljer («Flytt …»), avbestilling med begrunnelse (skjerm 9) | Flytting bekreftes alltid i en dialog med påkrevd begrunnelse |
| **8. Rom-oppsett** (skjerm 8) | Fanen «Rom»: liste med rekkefølge (opp/ned-knapper), skjema med navn, plasser, godkjenning, aktiv, bilde fra mediebiblioteket, åpningstider per ukedag og rominstruks med advarsel mot koder/passord; stengte dager og sperrede tider med antall berørte bookinger | Rominstruksen vises på bekreftede bookinger under «Mine bookinger» |
| **9. Kvalitet og overlevering** | Playwright-e2e + axe, bundle-størrelse, oversettelser, instruks for flytting til creo-wp | — |

Fase 0–4 er kjernen i PoC-en. Hver fase leveres som egen PR.

---

## 8. Avklart
| Spørsmål | Beslutning |
|---|---|
| Design | creo-temaet, ikke BCC-designsystemet |
| Pakkenavn | `creo-rombooking`, prefiks `creo_rombooking` |
| Hvem er medlem | Medlemskap fra `bcc-login` |
| Telefonnummer | Fra tokenet; ellers feltet «Legg inn telefonnummer» ved booking |
| Språk | Engelske kildestrenger + `nb_NO.po`; bare norsk i PoC-en |
| Admin-skjermer | På nettsiden, bak admin-rollen |
| Bookinghorisont (fase 3) | Maks ett år frem i tid, også for serier; maks 26 forekomster per serie (som i prototypen) |
| Konflikt (fase 3) | En tid er i konflikt når den overlapper en godkjent booking eller en ventende forespørsel; forespørselen kobles til den godkjente bookingen først |
| Månedlig gjentakelse (fase 3) | Samme dato hver måned; måneder uten datoen (f.eks. 31.) hoppes over |
| Telefonnummer ved booking (fase 3) | Norsk mobilnummer (8 siffer, starter med 4 eller 9), lagres som `+47 XXX XX XXX` |
| Antall personer | Påkrevd felt i skjemaet, maks rommets kapasitet. Brukes til forslag om rom med nok plass i admin-innboksen |
| Forslag (fase 4) | Når admin foreslår annet rom/tid, eller avbestiller med forslag, får bookingen status `proposed` og et forslag med svarfrist (24 t / 48 t / 3 dager, 48 t valgt). Tiden holdes ikke av før medlemmet svarer; svaret sjekker på nytt at den er ledig (fase 6) |
| Konflikt i admin (fase 4) | En forespørsel er i konflikt når den overlapper en **godkjent** booking. Å godkjenne én av to forespørsler til samme tid gjør den andre til en konflikt |
| SMS for serier (fase 4) | Beslutninger på enkeltdatoer i en serie gir én samlet SMS når ingen datoer venter lenger; «Avslå resten» tar med begrunnelsen |
| Flytt eksisterende (fase 4) | Bare mulig når forespørselen kolliderer med nøyaktig én booking; rom med nok plass som er ledige samme tid foreslås |
| Svar på forslag (fase 6) | «Aksepter» flytter bookingen til foreslått rom/tid og bekrefter den, hvis tiden fortsatt er ledig. «Avslå» avbestiller bookingen/forespørselen. Ubesvarte forslag utløper (WP-Cron hver time, og når listen leses), og medlemmet får SMS |
| Avbestilling (fase 6) | Medlemmet kan avbestille til bookingen starter, uten begrunnelse, og får SMS som kvittering. Admin varsles ikke |
| Flytting i oversikten (fase 7) | Dra-og-slipp åpner flyttedialogen utfylt med nytt rom og ny starttid (samme varighet); tastaturbrukere åpner bookingen og velger «Flytt …». Begrunnelse er påkrevd og sendes på SMS. I serier flyttes bare den ene datoen |
| Avbestilling fra admin (skjerm 9) | Åpnes fra bookingens detaljer i oversikten, og fra konfliktene i innboksen |
| Rom (fase 8) | Rom slettes aldri (bookinger peker på dem); de gjøres inaktive og kan da ikke bookes. Skjemaet har ett tidsrom per ukedag (datamodellen tåler flere). Nye unntak endrer ikke eksisterende bookinger, men admin får vite hvor mange som berøres |
| Ukevisning (fase 5) | Ett rom om gangen, som i prototypen. Uke 1 følger ISO 8601. På mobil (ikke i prototypen) ruller dagene sideveis inne i gridet |
| Innsendte forespørsler (fase 4) | Innboksen viser forespørsler fra i dag og fremover, eldste først innen hver gruppe |

## 9. Åpne spørsmål
1. **Telefon i tokenet:** hvilket claim heter det, og er det tilgjengelig på serversiden (ID-token/brukerinfo lagret av
   `bcc-login`)? Kan verifiseres med en testbruker; frem til da brukes antakelsen over + reservefeltet.
2. **SMS-leverandør**, og skal det sendes SMS også ved autogodkjenning?
3. **Svarfrist** for forslag: 24 t / 48 t / 3 dager fra prototypen er brukt, med 48 t som standard. Ok?

