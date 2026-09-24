# Rombooking – implementasjonsplan (proof of concept)

Status: utkast, 24.09.2026. Målet er en klikkbar, men ekte, WordPress-plugin i dette repoet
(`tbg-roombooking`) som senere kan flyttes inn i `creo-wp`.

---

## 1. Kildegrunnlag og tilgang

| Kilde | Tilgang | Hva vi fikk |
|---|---|---|
| Prototype (claude.ai-artifact, «Rombooking for menigheten») | ✅ Lest | Tre tegnebrett: `Main` (medlem, dag/uke + skjema, 1100 px), `Mobile` (360 px), `Admin` (forespørsler/konflikter, 1100 px). Eksempeldata, statusmodell, tekster, tastaturhjelp. Designsystem-kopi «BCC Event» (`tokens.json`). |
| BCC design system – `components.bcc.no/llms.txt` | ❌ Blokkert av nettverkspolicy (403 fra egress-proxy) | — |
| BCC design system via npm | ✅ | `@bcc-code/component-library-vue@1.4.36` (Vue 3 + PrimeVue 4 + Tailwind 4, Storybook = components.bcc.no), `@bcc-code/design-tokens@5.2.10`, `@bcc-code/icons(-vue)@1.5.4`. README, typer, CSS og komponentliste er lest lokalt. |
| `bcc-code/bcc-design` (kildekoden til components.bcc.no) | ✅ Klonet (offentlig) | `component-library/docs/**/*.mdx` (farger, typografi, tokens, spacing, ikoner) og komponentstories – samme innhold som `llms.txt` genereres fra. |
| `bcc-code/bcc-wp` | ✅ Klonet (offentlig) | `bcc-login`-pluginen definerer rollen `bcc-login-member` («Member»). Ingen telefonnummer i brukerdata der. |
| `creo-web/creo-wp` | ❌ Ingen tilgang | GitHub-kontoen er koblet til, men Claude GitHub-appen er bare installert for `akselkvitberg` og `bcc-code`, ikke for organisasjonen `creo-web`. |
| WordPress-kjerne, Packagist, npm, WP Playground | ✅ Nåbare | Vi kan kjøre WP lokalt/CI (PHP 8.4, Node 22, Composer og Docker finnes i miljøet). |

**Trengs fra dere:**
1. Tilgang til `creo-web/creo-wp`: installer Claude GitHub-appen på organisasjonen `creo-web` (via
   https://claude.ai/connect-github, eller be en eier av organisasjonen gjøre det). Alternativt en beskrivelse av:
   PHP-versjon, namespace/autoload-konvensjon, byggeverktøy (Vite? wp-scripts?), om det brukes Gutenberg-blokker
   eller shortcodes, hvordan brukere/roller og SMS håndteres i dag, og kodestil (PHPCS-regelsett).
2. (Valgfritt) Nettverkstilgang til `components.bcc.no`. Ikke kritisk, siden `bcc-code/bcc-design` og npm-pakkene
   dekker det samme innholdet.

---

## 2. Hva prototypen dekker – og hva som mangler

| # | Skjerm | I prototypen |
|---|---|---|
| 1 | Matrise, dagvisning | ✅ rom × 28 halvtimesluker 08–22, legend, datovelger, «I dag», dag/uke-bryter, tastaturhjelp |
| 2 | Matrise, ukevisning | ✅ (i `Main`) |
| 3 | Mobil 360 px | ✅ romvelger + vertikal tidsliste |
| 4 | Bookingskjema | ✅ forhåndsutfylt, validering, «opptatt → sendes til admin», gjentakelse + forhåndsvisning (Ledig / Konflikt / Utenfor åpningstid) |
| 5 | Mine bookinger | ❌ må designes (avbestilling «denne»/«denne og alle senere», kort for alternativt forslag med Aksepter/Avslå + svarfrist) |
| 6 | Admin-innboks | ✅ konflikter øverst, side-om-side, forslag til ledige rom, serie-handlinger, tomtilstand |
| 7 | Admin-matrise med dra-og-slipp | ❌ må designes (inkl. tastaturalternativ til dra) |
| 8 | Rom-oppsett | ❌ må designes |
| 9 | Avbestilling fra admin | 🟡 finnes som del av konfliktflyten («Godkjenn og avbestill»); trenger frittstående variant |

Eksempeldata fra prototypen (oppdiktede navn, rom, åpningstider, unntak) gjenbrukes som seed-data.
Prototypen bruker aksentfarge `#0c625c` og Archivo, med mulighet for «tema-font» – det matcher BCC-bibliotekets
brand-ramper (`--color-brand-*`), som kan overstyres fra temaet.

---

## 3. Arkitektur

```
tbg-roombooking/
├── tbg-roombooking.php          # plugin-header, bootstrap
├── composer.json                # PSR-4: TBG\RoomBooking\ ; dev: phpunit, phpcs (WPCS)
├── src/                         # PHP
│   ├── Plugin.php               # hooks, aktivering/avinstallering
│   ├── Install/Schema.php       # dbDelta-tabeller + versjonsmigrering
│   ├── Domain/                  # Room, Booking, Series, Request, Proposal, Exception (rene PHP-klasser)
│   ├── Service/                 # Availability, Recurrence, ConflictResolver, Notifier (SMS-grensesnitt)
│   ├── Repository/              # $wpdb-baserte repositorier
│   ├── Rest/                    # WP REST-kontrollere, namespace tbg-rb/v1
│   ├── Frontend/Shortcode.php   # [tbg_rombooking] og [tbg_rombooking_admin] + blokk-wrapper
│   └── Admin/Menu.php           # wp-admin-side som monterer admin-appen
├── app/                         # Vue 3 + TypeScript + Vite
│   ├── src/main.ts              # monterer på .tbg-rb-root, leser bootstrap-data (nonce, rolle, bruker)
│   ├── src/api/                 # typed klient mot REST
│   ├── src/components/matrix/   # DayMatrix, WeekMatrix, MobileDayList, StatusCell, Legend
│   ├── src/components/booking/  # BookingForm, RecurrencePreview
│   ├── src/views/               # MinSide (Mine bookinger), AdminInbox, AdminMatrix, RoomSetup
│   └── src/lib/                 # tid/dato (nb-NO), tastaturnavigasjon (roving tabindex), tekster
├── build/                       # Vite-output (enqueues via manifest)
├── tests/php, app/src/**/*.spec.ts, e2e/ (Playwright + axe)
└── docs/
```

### 3.1 Frontend og BCC design system
- **Vue 3 + `@bcc-code/component-library-vue`** (BccButton, BccInput, BccSelect/SelectButton, BccDatePicker,
  BccDialog/BccDrawer, BccMessage, BccTag/BccBadge, BccTabs, BccToggle, BccCapacityIndicator, useToast/useConfirm)
  og `@bcc-code/icons-vue` for statusikoner.
- **Viktig funn – CSS-isolasjon:** bibliotekets `style.css` inneholder Tailwind *preflight* (`*{margin:0;padding:0;border:0}`,
  `html{font-family…}`) og `:root`-variabler. Lastet rett inn i et WP-tema vil det ødelegge temaet. Løsning:
  - Bygg med Tailwind i egen Vite-pipeline (bibliotekets «Option 1», `theme.css`) **uten preflight**, og kjør en
    PostCSS-scoping (f.eks. `postcss-prefix-selector`) slik at alt ligger under `.tbg-rb`.
  - Sett PrimeVue `appendTo` / Teleport-mål til et element inne i `.tbg-rb` slik at dialoger og popovers arver scope.
  - Alternativ (fallback): Shadow DOM. Mer isolert, men vanskeligere for overlays og tema-arv – vurderes bare hvis scoping ikke holder.
- **Tilpasning til tema:** `font-family: inherit` som standard (valgfritt Archivo), og aksent via `--color-brand-*`
  som temaet/innstillinger kan overstyre (én fargevelger i plugin-innstillingene).
- Innholdsbredde maks ~1100 px; matrisen scroller horisontalt internt med klebrig romkolonne. Under ~640 px byttes til
  mobilvisning (ett rom om gangen).

### 3.2 Backend (WordPress)
- **Roller:** `medlem` = innlogget bruker med capability `tbg_rb_book` (gis som standard til `bcc-login-member`
  fra `bcc-login` hvis den finnes, ellers `subscriber`); `admin` = `tbg_rb_manage`
  (gis til administrator + evt. egen rolle «Romansvarlig»). Ikke innlogget → innloggingsmelding.
- **Personvern i API-et:** medlem-endepunktene returnerer aldri navn/formål på andres bookinger – kun status
  (`free|busy|requested|closed|mine`). Dette håndheves på serveren, ikke bare i UI.
- **SMS:** `Notifier`-grensesnitt med `LogNotifier` (PoC: skriver til logg + admin-side «Sendte meldinger»).
  Ekte leverandør kobles på i creo-wp. Telefonnummer fra brukermeta.
- **Tidssone/format:** `wp_timezone()`, lagring som lokal dato + minutter, visning nb-NO.

### 3.3 Datamodell (egne tabeller, `{prefix}tbg_rb_*`)
| Tabell | Nøkkelfelt |
|---|---|
| `rooms` | id, navn, beskrivelse, kapasitet, bilde (attachment_id), aktiv, godkjenning (`auto`/`manuell`), rominstruks, sortering |
| `opening_hours` | room_id, ukedag, fra, til (flere intervaller per dag tillatt) |
| `closures` | room_id, dato, fra?, til?, type (`stengt`/`sperret`), begrunnelse |
| `series` | id, user_id, room_id, regel (`weekly`/`biweekly`/`monthly`), start, slutt-dato eller antall |
| `bookings` | id, series_id?, room_id, user_id, dato, fra, til, formål (≤200), status (`requested`/`approved`/`rejected`/`cancelled`), konflikt_med?, opprettet |
| `proposals` | id, booking_id, foreslått rom/dato/fra/til, melding, svarfrist, status (`pending`/`accepted`/`declined`/`expired`) |
| `events` (logg) | booking_id, aktør, handling, begrunnelse, sms_sendt, tidspunkt |

Regler: 30-min-granularitet; overlapp sjekkes mot `approved` (+ `requested` gir «Forespurt»); rom med auto-godkjenning
godkjennes straks hvis ledig, ellers `requested` med konflikt; «Utenfor åpningstid» utelates fra serier.
Utløpte forslag ryddes med WP-Cron.

### 3.4 REST API (`/wp-json/tbg-rb/v1`, nonce + capability-sjekk)
- `GET rooms` · `GET availability?from=&to=&room=` (status per luke, uten navn for medlem)
- `POST bookings/preview` (forekomster + status Ledig/Konflikt/Utenfor) · `POST bookings`
- `GET me/bookings` · `POST bookings/{id}/cancel` (`scope=this|following`) · `POST proposals/{id}/accept|decline`
- Admin: `GET requests` (konflikter først) · `POST requests/{id}/approve|reject|propose|move-existing|approve-and-cancel-existing`
  · `POST series/{id}/approve-free` · `GET admin/availability` (med navn) · `PATCH bookings/{id}` (flytt rom/tid)
  · `POST bookings/{id}/admin-cancel` (påkrevd begrunnelse, valgfritt forslag) · CRUD `rooms`, `opening-hours`, `closures`
  · `GET rooms/{id}/suggestions?date=&from=&to=&capacity=` (ledige rom med nok plass)

---

## 4. Tilgjengelighet (WCAG 2.1 AA)
- Matrisen som `role="grid"` med rad-/kolonneoverskrifter, *roving tabindex*: piltaster, Home/End, PageUp/PageDown
  (forrige/neste dag), Enter/Space åpner skjema. Hver celle har tilgjengelig navn: «Møterom 1, 12:00–12:30, Ledig».
- Status = farge **+ ikon + tekst/mønster** (f.eks. skravur for Stengt). Kontrast ≥ 4.5:1 for tekst, ≥ 3:1 for UI-grenser –
  verifiseres mot BCC-tokens.
- Dra-og-slipp i admin-matrisen har tastaturalternativ («Flytt …» → velg rom/tid) og `aria-live`-kunngjøring.
- Dialoger: fokusfelle, Esc lukker, fokus tilbake til utløsende celle. Feilmeldinger koblet med `aria-describedby`,
  feiloppsummering øverst («Rett opp før du sender»).
- Bekreftelser og tomtilstander via `role="status"` / toast («Bookingen er godkjent. Du får SMS.»,
  «Ingen forespørsler venter»).
- Automatisk test: axe-core i Playwright på alle skjermer, både 1100 px og 360 px, pluss manuell skjermlesersjekk (NVDA/VoiceOver).

---

## 5. Faser

Rekkefølge følger bestillingen: matrise dag (desktop + mobil) og skjema først, deretter admin-innboks.

| Fase | Innhold | Ferdig når |
|---|---|---|
| **0. Oppsett** | Plugin-skjelett, Composer/PSR-4, Vite + Vue + TS, BCC-bibliotek med scopet CSS, lokal WP via `@wp-playground/cli` (eller wp-env), seed-data fra prototypen, CI (PHPCS, PHPUnit, Vitest, bygg) | Tom app monteres via shortcode i et standardtema (Twenty Twenty-Five) uten at temaets stil endres |
| **1. Domene + API (lesing)** | Tabeller, repositorier, `Availability`, `GET rooms/availability` med personvernfiltrering | Enhetstester for statusberegning (åpningstid, unntak, overlapp) |
| **2. Matrise dag + mobil** (skjerm 1, 3) | DayMatrix, StatusCell, Legend, datovelger, dag/uke-bryter, tastaturnavigasjon, MobileDayList | Klikk/Enter på celle åpner skjema; axe uten feil |
| **3. Bookingskjema** (skjerm 4) | BookingForm, validering, `Recurrence` + `preview`, auto/manuell-melding, «opptatt → til admin», bekreftelse | Booking lagres, vises som «Din booking»/«Forespurt» |
| **4. Admin-innboks** (skjerm 6, 9) | Forespørsler med konflikter øverst, side-om-side, forslag til ledige rom, alle fire handlinger, serie-handlinger, avbestillingsdialog med påkrevd begrunnelse, LogNotifier | Alle flyter i prototypen fungerer mot ekte data |
| **5. Ukevisning** (skjerm 2) | WeekMatrix med blokker | — |
| **6. Mine bookinger** (skjerm 5) | Kommende/ventende, avbestilling denne/senere, forslagskort med Aksepter/Avslå + svarfrist | Design avklares først (mangler i prototypen) |
| **7. Admin-matrise** (skjerm 7) | Navn i celler, dra til annet rom + tastaturalternativ | — |
| **8. Rom-oppsett** (skjerm 8) | Liste + skjema, åpningstider per ukedag, unntak, bilde via mediebibliotek, rominstruks med advarsel mot koder/passord | — |
| **9. Kvalitet og overlevering** | Playwright-e2e + axe, ytelse (bundle-størrelse), dokumentasjon for flytting til creo-wp | — |

Fase 0–4 er PoC-kjernen. Hver fase leveres som egen PR.

---

## 6. Åpne spørsmål
1. **creo-wp:** konvensjoner (se §1). Skal PoC-en bli en egen plugin i creo-wp, eller en modul i en eksisterende plugin?
2. **Brukere:** er «medlem» alle innloggede WP-brukere, eller finnes det allerede en rolle/medlemsregister i creo-wp?
   Hvor ligger telefonnummer?
3. **SMS-leverandør** og om SMS også skal sendes ved auto-godkjenning.
4. **Admin-UI:** skal admin-skjermene ligge i wp-admin eller på frontend-siden bak rolle? (Planen støtter begge; anbefaling: frontend, siden samme matrise gjenbrukes.)
5. **«Antall personer»** vises i prototypens admin-visning, men står ikke i feltlisten for skjemaet. Skal det være et felt (brukes til forslag om rom med nok kapasitet)?
6. **Svarfrist** for forslag: prototypen har 24 t / 48 t / 3 dager – ok som standardvalg?
7. **Maks bookinghorisont** (hvor langt frem kan medlemmer booke / hvor lange serier)?
8. **Font:** arve temaets font som standard, eller BCCs Archivo?
