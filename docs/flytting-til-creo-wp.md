# Flytting av rombooking til creo-wp

Pluginen `creo-rombooking` er bygget etter konvensjonene i creo-wp, slik at den kan flyttes inn som en ny pakke ved
siden av `creo-blocks`. Denne instruksen beskriver hva som flyttes, hva som må endres i creo-wp, og hva som bør avklares
før pluginen tas i bruk.

## 1. Kopier filene

| Fra `tbg-roombooking` | Til `creo-wp` | Merknad |
|---|---|---|
| `packages/creo-rombooking/` | `packages/creo-rombooking/` | Hele pakken. `build/` og `node_modules/` ligger ikke i git. |
| `tests/phpunit/creo-rombooking/` | `tests/phpunit/creo-rombooking/` | PHPUnit-testene. |
| `tests/e2e/`, `playwright.config.ts` | samme sted | Valgfritt: Playwright + axe. Se punkt 4. |
| `jest.config.cjs` | samme sted | Valgfritt: Jest for ren logikk i `src/lib/`. |

Kopier **ikke** `bin/php-server.sh`, `bin/wp-setup.sh`, `vendor-theme/` eller `tools/scripts/`. De finnes bare for
proof of concept-en (temaet som submodul og kjøring uten Docker). `tools/scripts` er en kopi av `@creo-wp/scripts`.

## 2. Endringer i creo-wp

1. **`.phpcs.xml`:** legg til prefikset og tekstdomenet:
   ```xml
   <property name="prefixes" type="array" value="creo,creo_blocks,creo_rombooking" />
   <property name="text_domain" type="array" value="default,creo,creo-blocks,creo-rombooking" />
   ```
2. **`tests/phpunit/bootstrap.php`:** aktiver pluginen i testene:
   ```php
   return array(
       'creo-blocks/creo-blocks.php',
       'creo-rombooking/creo-rombooking.php',
   );
   ```
3. **`package.json` i roten** (pnpm-overstyringer):
   - `"tailwindcss": "3.3.2"`: Tailwind 3.4 lager `:is()`-selektorer som postcss advarer om i pluginens nestede CSS.
     Sjekk om creo-temaet tåler samme versjon, ellers overstyr bare for pakken.
   - `"@types/minimatch": "5.1.2"`: versjon 6 er en tom stub som gjør at `tsc` feiler.
   - `devDependencies` for testene i punkt 4: `@playwright/test`, `@axe-core/playwright`, `@types/jest`.
4. **`.wp-env.json`:** pluginen må være med (`"plugins": ["./packages/creo-blocks", "./packages/creo-rombooking"]`).
   Oppsettet i `bin/wp-env-setup.js` her (testbrukere, siden «Rombooking», eksempeldata) kan flyttes inn i creo-wp sitt
   oppsettskript hvis dere vil ha det lokalt.
5. **Oversettelser:** composer-skriptene i creo-wp (`i18n-make-pot`, `i18n-update-po`, `i18n-make-mo`, `i18n-make-json`)
   fungerer for pakken. `make-json` må kjøres med `--no-purge`, og `make-pot` må lese `build/`, ikke `src/`, fordi
   JSON-filene knyttes til de bygde filene. Admin-fanene er en egen fil (`build/creoRombookingAdmin.js`), og
   oversettelsene for den legges inn av PHP (`Creo_Rombooking::add_admin_translations()`).
6. **Release:** `bin/create-release-assets.js` zipper hver pakke automatisk. `includes/updater.php` sjekker
   `creo-wp.creoweb.no/creo-rombooking.json`, som må legges til på oppdateringsserveren.

## 3. Arbeidsflyter (CI)

Arbeidsflytene her er kopiert fra creo-wp og kjører bare ved push til `main` og på pull requests. **De har ikke kjørt
for denne grenen ennå**, fordi det ikke finnes en pull request. I creo-wp trengs:

- **CI** (bygg, ESLint, Stylelint, `tsc`, Jest, PHPCS): creo-wp kjører i dag ikke `tsc` eller Jest. Legg til
  `pnpm lint:types` og `pnpm test:js`, eller dropp dem.
- **Test** (PHPUnit): fungerer uten endring når bootstrap-filen har pluginen (punkt 2.2).
- **E2E** (valgfritt): jobben `e2e` i `.github/workflows/test.yml` her starter WordPress med `bin/php-server.sh` mot en
  MySQL-tjeneste. I creo-wp er det enklere å bruke `wp-env` og `pnpm test:e2e`, med
  `E2E_RESET_COMMAND="pnpm wp creo-rombooking seed --reset"` (standardverdien).

## 4. Tester

| Nivå | Kommando | Innhold |
|---|---|---|
| PHPUnit | `pnpm test:php` | Ledighet, serier, konflikter, admin-handlinger, Mine bookinger, rom, rettigheter, at navn ikke lekker til medlemmer |
| Jest | `pnpm test:js` | Datoer, tastaturnavigasjon, segmenter, skjemaregler |
| Playwright + axe | `pnpm test:e2e` | Alle skjermer på 1280 og 360 px, i lys og mørk modus, med WCAG 2.1 AA-sjekk |

E2E-testene endrer data, så de tilbakestiller eksempeldataene før de starter (`seed --reset`, som bare er tillatt når
`WP_ENVIRONMENT_TYPE` er `local` eller `development`).

## 5. Koble til BCC-innlogging og SMS

Pluginen har tre filtre som kobler den til resten av løsningen:

| Filter | Standard | Hva som må gjøres |
|---|---|---|
| `creo_rombooking_is_member( $is_member, $user )` | Rollen `bcc-login-member` hvis den finnes, ellers alle innloggede | Bekreft rollenavnet fra `bcc-login`. |
| `creo_rombooking_token_phone( $number, $user_id )` | `null` (lokalt: brukermeta `creo_rombooking_dev_token_phone`) | Returner mobilnummeret fra tokenet til `bcc-login` (f.eks. OIDC-claimet `phone_number`). Uten nummer spør bookingskjemaet om det. |
| `creo_rombooking_send_sms( $sent, $phone, $text, $user_id )` | `false` (bare logg) | Send meldingen via SMS-leverandøren og returner `true`. Alle meldinger lagres uansett i SMS-loggen. |

Administratorer har capability `creo_rombooking_manage`. Pluginen gir den til rollen `administrator` og lager rollen
`creo_rombooking_admin` («Romansvarlig»), som bare har denne.

## 6. Før produksjon

- **Åpne spørsmål i [implementasjonsplanen](implementasjonsplan.md#9-åpne-spørsmål):** telefonclaimet i tokenet,
  SMS-leverandør og om det skal sendes SMS ved autogodkjenning, og svarfristene for forslag.
- **Personvern:** hendelsesloggen lagrer SMS-tekstene, og telefonnummer lagres i brukermeta
  (`creo_rombooking_phone`) når det ikke kommer fra tokenet. Bestem hvor lenge loggen skal beholdes. Det finnes ingen
  automatisk sletting ennå.
- **Avinstallering:** pluginen har ingen `uninstall.php`. Tabellene (`{prefix}creo_rombooking_*`) blir liggende hvis
  pluginen slettes.
- **Eksempeldata:** `wp creo-rombooking seed` virker bare i utviklingsmiljø. Rom settes opp i fanen «Rom».
- **WP-Cron:** ubesvarte forslag utløper via hendelsen `creo_rombooking_expire_proposals` (hver time), og når listen
  leses. På nettsteder med `DISABLE_WP_CRON` må systemets cron kalle `wp-cron.php`.

## 7. Kjente begrensninger

- Skjemaet for rom har ett tidsrom per ukedag. Datamodellen støtter flere, for eksempel stengt i lunsjen.
- Oversikten for admin har bare dagvisning. Dra-og-slipp virker ikke på berøringsskjermer, men «Flytt …» i bookingens
  detaljer gjør det samme.
- Et forslag holder ikke av tiden. Når medlemmet svarer, sjekkes det på nytt at tiden er ledig.
- Admin varsles ikke når et medlem avbestiller.
- Bare norsk bokmål er oversatt. Kildestrengene er på engelsk, som i creo-wp.
