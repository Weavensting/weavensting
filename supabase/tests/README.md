# Database tests

`01_rls_test.sql` exercises the row-level security rules as three different
users: that a stranger sees nothing, that an invite grants access exactly once,
that an editor can add recipes but not delete the cookbook, that pantries stay
private, and that a malformed photo path is denied rather than raising.

These are the rules that fail silently if they are wrong — a too-permissive
policy looks identical to a correct one until someone reads another family's
recipes.

## Running them

Against a local Supabase stack:

```bash
supabase start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/01_rls_test.sql
```

Against any plain Postgres 16 — `00_supabase_stubs.sql` stands in for the
`auth` and `storage` schemas Supabase manages:

```bash
createdb cookbook_test
psql cookbook_test -f supabase/tests/00_supabase_stubs.sql
psql cookbook_test -f supabase/migrations/20260101000000_init.sql
psql cookbook_test -f supabase/migrations/20260101000100_extraction_quota.sql
psql cookbook_test -f supabase/tests/01_rls_test.sql
```

Every check prints `pass | t`, or a `pass (...)` notice where the expected
outcome is a rejection.
