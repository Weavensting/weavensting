# Roadmap

What exists, what is next, and what the long-term ideas from the original brief
need in order to work properly.

## Built

- Expo app for iOS, Android and web; all three bundles verified, web export
  driven in a browser.
- Recipe model with ingredient parsing, units, kitchen-fraction scaling.
- Local-first storage (SQLite on device, IndexedDB on web) with soft deletes.
- Import from links via schema.org markup — no model call, no cost.
- Import from photos, dictation and pasted text via Claude, behind a review screen.
- **Sign in with Google and Apple**, native account pickers, with recipes made
  while signed out claimed by the new account.
- Cook mode: one step at a time, timers from step text, screen kept awake.
- Search over titles, ingredients, tags and attribution.
- Pantry, "what can I make tonight", and macro/time filters.
- Postgres schema with row-level security, invite codes, and a photo bucket,
  with a 17-check RLS test suite.
- Edge Functions holding the API key, with quotas and SSRF protection.

## Next

**The invite flow.** The database side is done — `claim_cookbook_invite` works,
roles and policies are tested. What is missing is a cookbook switcher and a
share sheet that produces an invite link. Until then, family sharing is
reachable only from a SQL console. This is the single biggest gap.

**Background sync.** `src/data/sync.ts` pushes and pulls correctly but only when
Settings → Sync now is tapped. It should run on app foreground, after a write
settles, and on a reconnect.

**Photo storage.** Recipe photos are currently local file URIs, which means they
do not travel between phones. The `recipe-photos` bucket and its policies exist
and are tested; uploading to it and rewriting the URI does not.

**The share sheet.** The biggest workflow win: share a Pinterest pin or a
YouTube video straight from those apps into this one, instead of copying a link
and switching apps. Needs a native share extension on iOS and an intent filter
on Android.

**Shopping list.** `buildShoppingList` already merges what several recipes need
and de-duplicates equivalent names. It has no screen yet.

## Later

**Better YouTube import.** Today the description and captions are read. Recipes
that are only ever spoken, with quantities shown on screen, would want frame
sampling — a real piece of work, and worth measuring against how often it is
actually needed.

**Nutrition worth trusting.** `estimate-nutrition` gives a reasonable per-serving
estimate and says that it is an estimate. Going further means a real food
composition database (USDA FoodData Central is free) so that "1 cup flour"
resolves to a known weight and a known profile, rather than a judgement call.
That is what would make macro filtering precise rather than indicative.

**Meal planning.** A week view, with the shopping list falling out of it. The
pantry matching and macro filtering it would build on already exist.

**Cooking history.** `timesCooked` and `lastCookedAt` are recorded but unused.
"What we actually make" is a better sort order than "recently added", and the
data is already there.

**Scanning a whole cookbook.** Multi-photo import works for one recipe over
several pages. Ingesting an entire inherited binder in one go is a different
job: page splitting, recipe boundary detection, and a review queue rather than a
review screen.

## Deliberately not done

**Email and password sign-in.** Google and Apple cover the realistic cases
without anyone inventing or forgetting a password. Magic-link email would be the
one to add if a relative has neither account — it needs no extra client setup.

**Offline AI import.** On-device models could read a clean printed page, but not
a grandmother's cursive on a stained card — which is the case that matters here.
Better to be honest that photo import needs a connection.

**Recipe scraping per site.** Site-specific scrapers for the hundred biggest
recipe blogs would raise the free-path hit rate a few points and then rot. The
schema.org path plus a model fallback covers the same ground without a
maintenance treadmill.

**A public recipe feed.** This is a family cookbook. Everything is private to
the cookbooks you belong to, and the schema has no notion of a public recipe.
