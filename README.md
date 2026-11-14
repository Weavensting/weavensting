# Family Cookbook

A recipe app for bringing family cookbooks to everyone's phone. Built mobile-first,
runs on iOS, Android and the web from one codebase.

The idea: getting a recipe *in* should never be the hard part. Paste a Pinterest
link, photograph a handwritten card, talk it through out loud, or drop in a
YouTube video — it becomes a real, searchable recipe. Then find it again by what
is actually in your kitchen, or by the calories and macros you are aiming for.

## What works today

**Getting recipes in**
- **Links** — recipe blogs and Pinterest pins are read straight from the page's
  own schema.org markup. Exact, instant, and free: no model call involved.
- **Photos** — a handwritten recipe card, a cookbook page, a screenshot. Several
  photos for one recipe if it runs over a page.
- **Dictation** — talk it through using your keyboard's microphone. Ramble; it
  gets sorted out.
- **Paste or type** — from a message, an email, or memory.
- **YouTube and social** — read from the description and captions.

Every path ends at the same review screen. Nothing saves until you have looked
it over, and the words you (or your grandmother) wrote are kept as written.

**Signing in**
- **Sign in with Google** and **Sign in with Apple**, both using the native
  account picker rather than a browser bounce.
- Entirely optional. The cookbook works on the device with no account; signing
  in adds syncing with the family and the import paths that need a server.
- Recipes added before signing in become yours automatically — nothing is
  stranded.

**Cooking from them**
- Ingredients scale to any number of servings, in kitchen fractions — `1 1/2 cups`,
  not `1.5 cups`.
- Cook mode: one step at a time, large type, screen stays awake, and any time
  mentioned in a step becomes a tappable timer.
- The ingredients each step needs are repeated under it, so you are not scrolling
  up with wet hands.

**Finding them again**
- Search across titles, ingredients, tags and who a recipe came from.
- **Tonight** — what you can cook from what is in the pantry, with a dial for how
  much you are willing to shop for.
- Filter by time, calories and macros.

**Everywhere, offline**
- Everything is stored on the device and works with no signal.
- Connect a Supabase project and it syncs across the family's phones.

## Running it

```bash
npm install
npm start          # then press i, a, or w
```

That is enough for link import, manual entry, cooking and search — all local, no
account, no server.

Sign-in, syncing, and photo/dictation import need a backend; see
[docs/setup.md](docs/setup.md) (about twenty minutes, free tier). Native Google
sign-in also needs a development build rather than Expo Go — that is covered
there too.

```bash
npm test           # 108 unit tests over the parsing, matching and search logic
npm run typecheck
npm run export:web # static web build in dist/
```

## How it is put together

| Layer | Where | What it does |
|---|---|---|
| Domain | `src/domain` | Recipes, ingredient parsing, units, scaling, pantry matching, search. Pure TypeScript, no React, fully tested. |
| Data | `src/data` | Local-first store: SQLite on device, IndexedDB on web, one in-memory index over both. |
| Auth | `src/auth` | Native Google and Apple sign-in, exchanged for a Supabase session. |
| Import | `src/import` | Source detection, the free schema.org path, and the client for AI extraction. |
| UI | `app`, `src/ui` | Expo Router screens and a small component set. |
| Backend | `supabase` | Postgres schema with row-level security, and Edge Functions that hold the Claude API key. |

[docs/architecture.md](docs/architecture.md) explains the decisions behind that
split. [docs/roadmap.md](docs/roadmap.md) is what comes next.

## A note on the name

`Family Cookbook` is a placeholder. It lives in `app.json` (`name`, `slug`) and
one string in `src/data/seed.ts` — change those three and it is yours.
