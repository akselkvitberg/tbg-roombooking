# TBG Rombooking

Proof of concept for rombooking for en lokal menighet, laget som en WordPress-plugin
(`packages/creo-rombooking`) etter konvensjonene i [creo-wp](https://github.com/akselkvitberg/creo-wp-fork).
Pluginen kan senere flyttes inn i creo-wp som en egen pakke. Se [implementasjonsplanen](docs/implementasjonsplan.md).

## Oppsett

Krever Node.js 22, pnpm 9 (via `corepack enable`), PHP 8.2+, Composer og Docker.

```bash
git clone --recurse-submodules git@github.com:akselkvitberg/tbg-roombooking.git
cd tbg-roombooking
pnpm install
pnpm wp-env start      # WordPress på http://localhost:8888, testinstans på :8889
pnpm dev               # bygger og følger endringer
```

`vendor-theme/creo-wp` er en git-submodul med creo-temaet. Oppsettet bygger temaet
(`bin/build-theme.sh`), aktiverer tema og plugin, installerer norsk språk, lager siden
«Rombooking» med blokken, oppretter testbrukere og legger inn eksempeldata fra prototypen.

### Testbrukere

| Bruker | Passord | Rolle | Telefon |
|---|---|---|---|
| `admin` | `password` | admin | har nummer |
| `medlem` | `password` | medlem | har nummer (simulerer nummer fra tokenet) |
| `medlem-uten-tlf` | `password` | medlem | mangler |
| `gjest` | `password` | innlogget, ikke medlem | – |

Alle navn og telefonnumre i eksempeldataene er oppdiktet.

### Nyttige kommandoer

```bash
pnpm wp creo-rombooking seed --reset   # tilbakestill eksempeldata
pnpm wp creo-rombooking sms-log        # vis SMS-er som ville blitt sendt (også i fanen «SMS-logg» som admin)
pnpm lint                              # ESLint, Stylelint, tsc og PHPCS
pnpm test:php                          # PHPUnit i wp-env
pnpm test:js                           # Jest (ren logikk i appen)
pnpm test:e2e                          # Playwright + axe mot http://localhost:8888 (tilbakestiller eksempeldata)
pnpm i18n-update                       # oppdater .pot/.po/.mo/.json
```

### Uten Docker-bygg

Der `wp-env` ikke kan bygge Docker-images (f.eks. i Claude Code-sesjoner i skyen), kjører
`bin/php-server.sh` WordPress med PHPs innebygde server mot en MySQL-server, med samme oppsett:

```bash
composer install
docker run -d --name rb-mysql -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 mysql:8
bin/php-server.sh              # http://localhost:8888
bin/php-server.sh --reset      # start på nytt
```

Playwright kan bruke en forhåndsinstallert Chromium med
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/sti/til/chromium pnpm test:e2e`, og en annen adresse med `WP_BASE_URL`.
E2e-testene booker rom, så de tilbakestiller eksempeldataene først. Med `bin/php-server.sh`:
`E2E_RESET_COMMAND="vendor/bin/wp --path=.tmp/wordpress creo-rombooking seed --reset" pnpm test:e2e`.

## CI

GitHub Actions kjører bygg, ESLint, Stylelint, tsc, Jest, PHPCS, PHPUnit (PHP 8.2) og
Playwright med axe (WCAG 2.1 AA) på 1280 og 360 px, i lys og mørk modus.
PHPUnit- og e2e-jobbene henter creo-temaet fra en privat submodul, og trenger derfor secret
`CREO_WP_TOKEN`: en token med lesetilgang til `akselkvitberg/creo-wp-fork`.
