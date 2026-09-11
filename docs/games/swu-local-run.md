# Running this branch locally

For the machine with the sorter attached. The README covers self-hosting in
general; this is the short path plus what is specific to the SWU branch.

## Why local rather than mault.xyz

mault.xyz runs upstream `master`, so none of the SWU work exists there — no
keywords, traits or arena as sortable fields, no pricing, no sorter-shaped bin
layout. It also caps free orgs at 50 scans a day.

Calibration works fine on the hosted app because the browser talks to the
sorter over WebSerial — the USB link is Chrome to hardware, and no server sits
in between. That is why it has been possible to avoid running locally so far.
It stops being possible the moment you want to scan against this branch.

Nothing in the app calls mault.xyz at runtime. The only references are a shop
link and a support email.

## Setup

```bash
cp .env.local.example .env
openssl rand -hex 32   # -> OWN_AUTH_TOKEN_PEPPER
openssl rand -hex 32   # -> IMPERSONATION_SECRET

docker compose up -d postgres
pnpm install
pnpm --filter @magic-vault/server db:migrate-local
pnpm dev
```

`db:migrate-local` is the local-mode migration entrypoint: it applies the
Drizzle migrations *and* `db/bootstrap-local.sql`, which creates the
`authenticated` role and `auth_is_org_member()` that every RLS policy depends
on. Neon provisions those automatically; local mode does not, so skipping this
step leaves every table readable by nobody.

Then sign up at http://localhost:5173 — the first account creates the org.

## SWU specifics

```bash
pnpm --filter @magic-vault/server bootstrap:swu
```

Creates the SWU game record and loads `data/seed/swu-field-definitions.json`
(26 fields). Run it again after changing that file — it is how keywords,
traits, arena and price reach the bin rule builder.

Then run the card sync from the admin UI.

### Two things to know about the sync

**Images had to be re-routed.** `cdn.starwarsunlimited.com` answers 403 to
every server-side request, so the vectoriser could not fetch a single card
image and the whole catalogue embedded to nothing. `lib/swu/images.ts` routes
through the SWU site's own Next.js image endpoint instead. If the sync reports
image errors for every card, that is the thing to look at.

**Prices come from TCGCSV**, keyed on (expansion code, card number). It fails
soft: if TCGCSV is unreachable, prices are null and nothing else breaks.

## Scanner expectations

Foil is not inferred. A foil and a non-foil of the same printing are the same
art, so both prices are stored and the foil toggle on the card picks between
them. Normal is the default, deliberately — foils are not reliably worth more
(SOR Snowspeeder #244 is $0.05 normal, $0.23 foil, and plenty of foils sell
below their normal counterpart).

Hyperspace, Showcase and Prestige *are* separate numbered printings with their
own art, so the scan resolves them on its own. The exception is the three
Prestige tiers: they share one artwork and embed at 0.985–0.993 similarity to
each other, which is too close to call. All three land in the top-5 matches and
the "which printing?" dialog decides. Their prices differ a lot ($9.41 /
$17.13 / unlisted for ASH Vader), so it is worth confirming rather than
guessing.

## Reskinning

Themes are one file each in `packages/web/src/styles/themes/`. Edit the Palette
block at the top of `sith.css` or `rebels.css`; everything below it is wiring.
See the README in that directory to add a third theme.
