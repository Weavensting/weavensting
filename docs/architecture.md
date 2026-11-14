# Architecture

## One codebase, four platforms

Expo (React Native) with Expo Router. iOS, Android and the web build from the
same source; the web build is a static export, so it deploys anywhere.

Where a platform genuinely differs, the bundler picks the file — `platformStore.ts`
versus `platformStore.web.ts` — rather than the code branching at runtime. That
keeps expo-sqlite's WebAssembly worker out of the web bundle entirely, and keeps
IndexedDB out of the native one.

## Local-first, sync second

Every write lands on the device immediately and is marked for sync. Nothing the
cook does waits on a network round trip, and the app is fully usable in a
kitchen with no signal — which is most kitchens.

```
screen → library (in-memory) → DocumentStore (SQLite | IndexedDB) → sync → Supabase
```

**The store is deliberately dumb.** It saves and loads opaque JSON documents by
collection and id. That is all.

**All the interesting logic runs in memory**, over the full recipe set. Searching,
pantry matching and macro filtering are plain TypeScript functions in
`src/domain` — one implementation, shared by every platform, testable in
milliseconds without a database or a simulator.

This is a deliberate trade against scale. A family cookbook is hundreds of
recipes, maybe a few thousand. Loading all of it is cheap, and it buys
synchronous reads, no query-language duplication between SQLite and IndexedDB,
and a search implementation you can unit test. If a cookbook ever grew past
what fits comfortably in memory, the `DocumentStore` interface is the seam to
push filtering down into.

Recipes are soft-deleted. A tombstone is what lets a delete on one phone reach
the rest of the family, instead of the recipe reappearing at the next sync.

Conflicts resolve last-write-wins on `updated_at`. Two people rarely edit the
same recipe in the same minute, and the cost of being wrong is one edit to redo.

## Signing in is optional, and late

Most apps put a login wall first. This one does not: you can install it, add
recipes, cook from them and search them without ever seeing an account screen.

That has one consequence worth designing for. Recipes created while signed out
are real recipes, not a throwaway demo, so they must survive the first sign-in.
`library.claimLocalDataFor(userId)` runs on every sign-in and hands every
unowned cookbook — and the recipes in it — to the new account, so they sync up
rather than being stranded on the device by a server that requires an owner. It
only touches *unowned* rows, so signing in on a shared device cannot take over
someone else's data, and it is idempotent.

## Native sign-in, not a browser redirect

Both providers follow the same shape: the platform hands back an OpenID Connect
ID token, and Supabase exchanges it for a session with `signInWithIdToken`. The
account picker is the system's own — no browser bounce, no deep link to catch,
no custom scheme to register beyond Google's iOS one.

The cost is that `@react-native-google-signin/google-signin` is a native module,
so the app needs a development build rather than Expo Go. The web build cannot
use it at all and falls back to `signInWithOAuth`, which is the redirect flow
browsers are fine with anyway.

Two details that are easy to get wrong, both commented at the call site:

- **The Google *web* client ID is the audience on every platform.** On iOS and
  Android you are not doing a web flow, but the ID token Google mints still
  carries the web client ID in `aud`, and that is what Supabase validates.
- **Apple's nonce is not hashed for you.** `expo-apple-authentication` passes
  the string straight through to `ASAuthorizationAppleIDRequest.nonce`, and
  Apple copies it into the token verbatim. So the app sends Apple the SHA-256
  and Supabase the raw value. Sending the same string to both fails
  verification.

## Import: free path first

```
link → schema.org markup on the page?  → yes → done, exact, no model call
                                       → no  → Claude reads the page text
photo / dictation / pasted text        →       Claude
                                       ↓
                            review screen (always)
                                       ↓
                                 saved recipe
```

Most recipe sites publish schema.org `Recipe` markup for Google, and most things
pinned to Pinterest link to such a site. `src/import/jsonld.ts` reads it
directly: instant, exact, and free. The model is for what that cannot read —
handwriting, speech, video descriptions, blogs without markup.

Everything ends at the same review screen. An extractor is allowed to be
unsure; a human resolves it before anything is saved.

## The raw line is the source of truth

```ts
interface Ingredient {
  raw: string;        // "1 1/2 cups all-purpose flour, sifted" — never overwritten
  quantity?: 1.5;
  unit?: 'cup';
  item: 'all-purpose flour';
  preparation?: 'sifted';
}
```

Parsing is a convenience that enables scaling, shopping lists and pantry
matching. It is never a replacement for what the cook wrote. When a line will
not parse — "a good glug of olive oil", "bake till it smells right" — it is
stored and displayed exactly as written, and scaling simply leaves it alone.

This matters more for family recipes than for a recipe database. The wording is
part of what people are keeping.

## Why the API key lives on a server

Anything in an app bundle is readable by anyone who installs it, including
`EXPO_PUBLIC_*` variables. So the Claude API key lives only in the Edge
Function's secrets.

The anon key does ship in the bundle, and that is fine — row-level security, not
key secrecy, is what protects the data. But it does mean anyone who extracts it
could call the functions, so `_shared/auth.ts` requires a genuinely signed-in
user and charges each call against a per-user daily quota.

`fetch-page` takes a URL from the client, which makes it a server-side request
forgery risk. `_shared/safeFetch.ts` checks every hop — scheme, hostname, and
the addresses it resolves to — against loopback, link-local (including cloud
metadata at `169.254.169.254`) and every private range, follows redirects
manually so a public URL cannot bounce somewhere private, and caps the response
size.

> One build-time trap worth repeating, because it fails silently: Metro inlines
> `EXPO_PUBLIC_*` by substituting a **static** `process.env.EXPO_PUBLIC_NAME`.
> A computed `process.env[name]` is not substituted and reads `undefined` in a
> release build, which looks exactly like "not configured yet". `src/config.ts`
> spells every variable out for that reason.

## Nutrition is labelled by where it came from

`Nutrition.basis` is `'source'`, `'estimated'` or `'manual'`, and the UI says
which. Transcription never invents numbers — that rule is in the extraction
system prompt. Estimation is a separate, explicit endpoint, and its output is
labelled as an estimate on screen.

## Pantry matching

Names are normalised before comparison: lowercased, de-pluralised, stripped of
descriptors ("3 large free-range eggs" → "egg"), with synonyms folded together
(scallion → green onion, plain flour → all-purpose flour).

A pantry entry satisfies an ingredient when one is a more specific version of
the other *and* they share a head noun. So "flour" covers "all-purpose flour",
but "chicken" does not quietly cover "chicken broth".

Staples — salt, flour, oil, water and friends — are assumed on hand, because a
"what can I make" list that demands you confirm you own salt is useless.

## Testing

108 unit tests over the parts where correctness is not obvious: quantity
parsing, unit normalisation, ingredient line parsing, fraction formatting,
duration extraction, schema.org extraction, name matching, search ranking, and
the repository's persistence, notification and sign-in-claiming behaviour.

They run in Node, not a simulator, because `src/domain` and `src/import` import
no React Native. A stub stands in for `react-native` where `Platform` is
touched (`test/reactNativeStub.ts`).

The database has its own tests (`supabase/tests/`): the row-level security rules
are exercised as three different users, because a too-permissive policy looks
exactly like a correct one until someone reads another family's recipes.

The UI is verified by building and driving it — `npm run export:web` plus a
browser — rather than by snapshot tests that assert a component still renders
the markup it rendered yesterday.

The Edge Functions are not covered. They need a Deno runtime and a live Claude
API key, so they have been reviewed and syntax-checked but not executed. Nor is
the native sign-in path: it needs a real device, a real Google project and a
real Apple developer account, so it has been written against the libraries'
current type definitions and verified to compile and bundle for both platforms,
but not run.
