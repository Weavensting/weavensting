# Setting up

The cookbook is a shared database, so the backend is not optional — recipes
live on the server and a cookbook belongs to an account. Nothing works until
this is done, including signing in.

It is one Supabase project, and the free tier is plenty for a family.

---

## The short version, for iOS with Sign in with Apple

If you have an Apple Developer account and only care about your own iPhone for
now, this is the whole path. It skips Google entirely — no Google Cloud
project, no client IDs, and none of the SHA-1 fingerprint business.

**1. Sign up at [supabase.com](https://supabase.com)** (free, no card), create a
project, and copy the Project URL and anon public key from Settings → API.

**2. Fill in `.env`:**

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
BUNDLE_ID=com.yourname.familycookbook
```

> Pick your own `BUNDLE_ID`. Bundle identifiers are unique across Apple's whole
> developer programme, so `com.familycookbook.app` is very likely taken — and
> changing it after the first build means registering a new App ID and redoing
> the Apple setup.

**3. Run the setup script:**

```bash
npm install -g supabase
scripts/setup.sh
```

It links the project, applies the migrations, deploys the Edge Functions, and
tells you what is still missing. Safe to run as many times as you like.

**4. Two things it cannot do for you**, because neither has an API:

- **Apple Developer** → Certificates, IDs & Profiles → your App ID → tick
  **Sign in with Apple**.
- **Supabase** → Authentication → Providers → **Apple** → enable it, and put
  your bundle ID in **Authorized Client IDs**.

  That is all native iOS sign-in needs. The Services ID, team ID and `.p8` key
  you will see in Apple's docs are for the *web* sign-in flow only.

**5. Build it onto your phone.** Expo Go will not do — Sign in with Apple is a
native capability, so this has to be a real build.

*On a Mac with Xcode*, plug the phone in and:

```bash
npx expo run:ios --device
```

*Without a Mac*, build in Expo's cloud:

```bash
npm install -g eas-cli
eas login                 # a free Expo account, separate from Apple's
eas build -p ios --profile development
```

EAS asks for your Apple ID, then registers the App ID, the provisioning
profile and the signing certificate for you. It can enable the Sign in with
Apple capability on the App ID at the same time, which saves you step 4a.

> **EAS builds do not read your `.env`** — it is gitignored, so it never
> reaches the build server, and the app would come out saying "not set up yet".
> Give EAS its own copy, once:
>
> ```bash
> eas env:create --environment development --name BUNDLE_ID --value com.yourname.familycookbook
> eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://yourproject.supabase.co
> eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJhbGci...
> ```
>
> None of these are secret — the anon key is gated by row-level security and a
> bundle ID is public — so a `preview` and `production` copy of the same three
> is all the rest of it takes.

**Optional, for reading handwritten recipe cards:**

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Everything else — link import, typing recipes in, cooking, search, the pantry —
works without it.

---

The rest of this page is the full reference, including Google sign-in and
Android.

# Full reference

## The Supabase project

Sign up at [supabase.com](https://supabase.com), create a project, and note the
**Project URL** and **anon public key** from Settings → API.

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then
restart the dev server — these are inlined at build time, not read at runtime.
(Metro substitutes a *static* `process.env.EXPO_PUBLIC_NAME`; a computed lookup
reads undefined in a release build, which looks exactly like "not configured".
`src/config.ts` spells each one out for that reason.)

The anon key is safe in the app bundle. Row-level security, not key secrecy, is
what protects the data. **Never put your Claude API key in `.env`** — anything
with an `EXPO_PUBLIC_` prefix ends up readable inside the shipped app.

## The migrations

`scripts/setup.sh` does this for you. By hand:

```bash
npm install -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates the tables, the row-level security policies, the recipe photo
bucket, the invite-code flow for adding family members, and the server-side
functions that decide the things two devices can race on (one pantry row per
food, one cookbook per person).

To check the schema before you trust it with anything:

```bash
supabase/tests/run.sh "$(supabase status -o env | grep DB_URL | cut -d= -f2-)"
```

## The Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy extract-recipe fetch-page estimate-nutrition
```

The key lives only in Supabase's secret store. The app calls the function; the
function calls Claude.

---

## Sign in with Google (optional)

### Google Cloud console

Create a project, configure the OAuth consent screen, then create **three**
OAuth client IDs under Credentials:

| Client type | Needs | Used for |
|---|---|---|
| **Web application** | Authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` | The audience Supabase validates every ID token against — **on iOS and Android too**, not only on the web |
| **iOS** | Bundle ID `com.familycookbook.app` | Identifies the app to the native sign-in sheet |
| **Android** | Package name `com.familycookbook.app` + SHA-1 fingerprint | Identifies the app; no client ID is used at runtime |

The web client ID doing double duty is the part that catches people out. On
native you are not doing a web flow — but the token Google mints still carries
the web client ID as its audience, and that is what Supabase checks.

### Supabase dashboard

Authentication → Sign In / Providers → Google:

- Enable it.
- Paste the **web** client ID and client secret.
- Add the **iOS and Android** client IDs to **Authorized Client IDs** (comma
  separated), so tokens minted for those audiences are accepted too.

### The app

In `.env`:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
```

That is all. `app.config.ts` derives the reversed URL scheme Google needs from
the iOS client ID, and only includes the Google plugin at all when these are
set — so an Apple-only build does not carry a scheme it can never use.

### Android SHA-1 fingerprints — read this one

An Android OAuth client is bound to the certificate that signed the build. Every
one of these is a *different* certificate:

- your local debug build,
- an EAS **development** build,
- an EAS **production** build,
- the key Google Play uses if Play App Signing re-signs your upload.

Register a client ID for each fingerprint you will actually use, or sign-in will
work in some builds and fail in others with the unhelpfully generic
`DEVELOPER_ERROR`. The app surfaces that case with a message naming the real
cause.

```bash
eas credentials            # shows the fingerprints EAS holds
```

For Play App Signing, the fingerprint is in the Play Console under
Setup → App integrity.

## Sign in with Apple

Much less setup: no client IDs in `.env`, no fingerprints.

1. In the Apple Developer portal, enable the **Sign in with Apple** capability
   for the `com.familycookbook.app` App ID.
2. In Supabase, Authentication → Providers → Apple, enable it and add
   `com.familycookbook.app` to the authorised client IDs.

`app.json` already sets `ios.usesAppleSignIn`, so the capability travels with
the build.

**You probably need this.** App Store Review Guideline 4.8 requires an
equivalent privacy-preserving login option alongside third-party sign-in, so a
Google-only iOS build is likely to be rejected. Sign in with Apple satisfies it.

### A detail worth knowing

Apple echoes the `nonce` back verbatim, so the hashing is the app's job: Apple
receives the SHA-256 of a random value and Supabase receives the raw value.
Sending the same string to both fails verification with a confusing error.
`src/auth/providers.ts` does it correctly; mentioned here because it is easy to
"simplify" by accident.

## You need a development build

Native Google sign-in is a native module, so it **does not run in Expo Go**:

```bash
npx expo run:ios        # or: eas build --profile development --platform ios
npx expo run:android
```

Sign in with Apple is iOS-only and also needs a real build. Everything else —
link import, manual entry, cooking, search, pantry — still runs in Expo Go.

---

## Optional settings

| Secret | Default | What it does |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5` | Model used for extraction. |
| `CLAUDE_EFFORT` | `medium` | Raise to `high` if handwriting is losing ingredients; lower to `low` to cut cost on clean printed text. |
| `EXTRACTION_DAILY_LIMIT` | `50` | Imports per person per day. |
| `ALLOW_ANONYMOUS_EXTRACTION` | unset | Set to `true` to allow import without signing in. Off by default — the anon key ships in the app, so this would let anyone who extracts it spend your API budget. |
| `ALLOWED_ORIGIN` | `*` | Lock CORS to your web deployment's origin once you have one. |

## What each function does

| Function | Purpose | Costs money? |
|---|---|---|
| `fetch-page` | Fetches a recipe page server-side and returns the HTML. The app parses the schema.org markup itself. | No |
| `extract-recipe` | Reads photos, dictated text, or an unstructured page into a recipe. | Yes |
| `estimate-nutrition` | Estimates macros for a recipe that came without them. | Yes |

`fetch-page` exists because the web build cannot fetch other origins (CORS), and
because some sites refuse requests that do not look like a browser. On iOS and
Android the app fetches directly first and only falls back to the server.

It is also the one endpoint that takes a URL from the client and fetches it, so
it checks every hop — scheme, hostname, and the addresses that hostname resolves
to — and refuses anything pointing at a private or link-local address.
See `supabase/functions/_shared/safeFetch.ts`.

## Costs, honestly

Link import from a normal recipe site costs nothing: it is parsing, not
inference. That is most imports.

Photo, dictation and markup-less page imports call Claude once each. A
handwritten card is roughly a few cents. `EXTRACTION_DAILY_LIMIT` is the ceiling
if something goes wrong.

## Inviting the family

An owner creates an invite code for their cookbook; the relative signs in and
redeems it with `claim_cookbook_invite(code)`. Codes are single-use and expire
after 30 days. Roles are `owner` (manages members), `editor` (adds and edits
recipes) and `viewer` (reads).

> The invite UI is not built yet — see [roadmap.md](roadmap.md). The database
> side is ready, tested and callable.
