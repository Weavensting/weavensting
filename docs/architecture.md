# Architecture

## One codebase, four platforms

Expo (React Native) with Expo Router. iOS, Android and the web build from the
same source; the web build is a static export, so it deploys anywhere.

Where a platform genuinely differs, the bundler picks the file — `platformStore.ts`
versus `platformStore.web.ts` — rather than the code branching at runtime. That
keeps expo-sqlite's WebAssembly worker out of the web bundle entirely, and keeps
IndexedDB out of the native one.

## One database, cached on the device

The cookbook is collective: several people read and write the same recipes. So
Supabase holds the data and the device holds a copy of it.

```
screen → library (in memory) → DocumentStore (SQLite | IndexedDB)   ← cache
              ↓                                                      
          Supabase  ← the source of truth; every write goes here first
              ↓
          realtime → other devices
```

**Writes go to the server and the row the server returns is what gets kept** —
never the object the app sent. That means `updated_at`, defaults and anything a
trigger touches are always the stored values, and two people editing the same
recipe are serialised by the database like in any other shared system. There is
no client-side merge and no last-write-wins.

**The local store is a cache, not a peer.** It exists so the app opens instantly
and so a recipe stays readable in a kitchen with no signal, which is most
kitchens. It is scoped to the signed-in account and cleared on sign-out,
because it is the server's data and not the device's.

**Reads stay in memory.** Searching, pantry matching and macro filtering are
plain TypeScript functions in `src/domain`, running over the whole set — one
implementation shared by every platform, testable in milliseconds without a
database or a simulator. A family cookbook is hundreds of recipes, maybe a few
thousand, so loading all of it is cheap. If one ever outgrew memory, the
`DocumentStore` interface is the seam to push filtering down into.

### An earlier version of this got it wrong

The first cut was local-first: the device authored writes independently and a
sync pass reconciled them last-write-wins. That is the right shape for a
single-user notes app and the wrong one here, and it produced a concrete bug —
two phones each adding "eggs" invented two different ids, both upserted on id,
and the second violated the unique index on `(user_id, lower(name))`, breaking
sync outright.

The fix is not a cleverer merge. Name uniqueness is a property of the data, not
of whichever phone typed it, so the decision belongs on the server:
`upsert_pantry_item` makes it once, under the index. The same reasoning put
`ensure_default_cookbook` there — signing in on two devices at once would
otherwise make two cookbooks.

### Offline writes

A failed write is either "the network is not there" or "the server said no",
and they deserve different treatment.

A network failure queues the write in an **outbox** and shows the change
anyway, marked as waiting. The queue drains oldest-first when the app comes
back to the foreground or a refresh runs, and it stops at the first network
failure so a later edit can never overtake an earlier one. A refresh always
flushes before it fetches, or the server's older copy would overwrite the edit
still sitting in the queue.

A server *rejection* will never succeed, so it is reported immediately rather
than retried forever.

Recipes are soft-deleted. A tombstone is what lets a delete on one phone reach
the rest of the family instead of the recipe reappearing at the next refresh.

## Finding the project, then the account

Two things must be true before the cookbook is reachable, and each has its own
screen. `Gate` in `app/_layout.tsx` decides which one you see: **Connect** when
the app does not know which Supabase project to talk to, **Sign in** when it
does but nobody is signed in.

The project can come from the build (`EXPO_PUBLIC_*`, inlined by Metro) or from
the device (typed into Connect, kept in AsyncStorage). Build time wins, so a
build deliberately pointed at a project cannot be redirected by what is left on
one phone — and such a build never shows Connect at all. The device route
exists so the app can be built and installed before the backend exists.

Because the project can change while the app is running, `src/config.ts` is a
small store rather than a constant, and `getSupabase()` throws away its client
whenever the connection changes. A cached client would otherwise go on talking
to the previous project for the rest of the session.

The anon key is stored in AsyncStorage rather than anything encrypted, because
it is not a secret: it ships inside every build of every Supabase app, and
row-level security is what protects the data. The Connect screen does check for
one real mistake — pasting the `service_role` key, which bypasses every policy
— and refuses it.

## Signing in comes first

A cookbook belongs to an account, and row-level security checks that account on
every read, so there is no signed-out mode: `AuthGate` in `app/_layout.tsx`
sends anyone without a session to the sign-in screen, including on a deep link.

That also means no local seed data. A brand-new cookbook is empty, which is
honest — these are meant to be *your family's* recipes, and pre-filling a real
shared cookbook with invented ones attributed to a fictional grandmother would
only be something to delete.

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

129 unit tests over the parts where correctness is not obvious: quantity
parsing, unit normalisation, ingredient line parsing, fraction formatting,
duration extraction, schema.org extraction, name matching, search ranking, and
the checks on a hand-typed connection.

The repository is tested against a stand-in server rather than Supabase,
because what matters is the contract: the row the server returns is what gets
kept, an optimistic value appears before the server answers, a write that
cannot reach the server is queued rather than lost, the queue goes out in
order, a flush happens before a refresh, a refusal is surfaced instead of
retried, and one account never sees another's cache.

They run in Node, not a simulator, because `src/domain` and `src/import` import
no React Native. A stub stands in for `react-native` where `Platform` is
touched (`test/reactNativeStub.ts`).

The database has its own tests (`supabase/tests/run.sh`). The row-level
security rules are exercised as three different users, because a
too-permissive policy looks exactly like a correct one until someone reads
another family's recipes — and the server-side RPCs are tested for the races
they exist to prevent.

One of those tests exists because of a bug that would have broken the app
outright. `RETURNING` makes Postgres apply the *select* policy to the row just
inserted, and membership is added by an AFTER trigger — so a `cookbooks_select`
policy that only checked membership rejected the owner reading back the
cookbook they had just created. PostgREST always inserts with RETURNING, so
creating a cookbook would have failed with an incomprehensible error. The
policy now checks `owner_id` directly as well, and a test inserts with
RETURNING to keep it that way.

The UI is verified by building and driving it — `npm run export:web` plus a
browser — rather than by snapshot tests that assert a component still renders
the markup it rendered yesterday.

The Edge Functions are not covered. They need a Deno runtime and a live Claude
API key, so they have been reviewed and syntax-checked but not executed. Nor is
the native sign-in path: it needs a real device, a real Google project and a
real Apple developer account, so it has been written against the libraries'
current type definitions and verified to compile and bundle for both platforms,
but not run.
