# Cloudflare staging deployment review

Reviewed 14 October 2026. **Proposal only: no cloud resources, secrets or deployments were created or changed.** Existing deployment configuration and migrations were not modified. Commands that write to Cloudflare below require explicit user approval first.

## Findings

| Area | Existing configuration | Staging implication |
| --- | --- | --- |
| Main deployment | Root `bun run deploy` → Turbo → `packages/infra` → `alchemy deploy`. Stack name `store-managment-communal-web`, logical resources database/server/web, Cloudflare-managed state. | No explicit staging separation in this stack. Do not run the root deployment/destroy commands for this staging setup. Wrangler authentication does not prove Alchemy provider/state readiness. |
| Server | `apps/server/wrangler.local.jsonc`: local-only Worker, localhost URLs, dummy D1 ID. Runtime reads bindings through `cloudflare:workers`, DB binding name `DB`. | Add a separate reviewed staging configuration; never deploy the local file. |
| Web | `apps/web/wrangler.jsonc`: unsuffixed name `store-managment-communal-web-web`, `.open-next/worker.js`, ASSETS, IMAGES; no named environment. | Do not deploy this file as-is. A staging-specific config prevents touching any existing Worker with that name. |
| OpenNext | `defineCloudflareConfig({})`; no configured R2/KV incremental cache. Alchemy supplies Images binding and builds web assets/Worker. | Retain default adapter and assets/images. No new R2/KV resource is needed for this proposal. Add the documented self-reference service binding to the staging web Worker; target only its own staging name. |
| Browser routing | Better Auth client uses same origin; tRPC uses `/trpc`. `next.config.ts` rewrites `/api/auth/*` and `/trpc/*` to `NEXT_PUBLIC_SERVER_URL`. | The staging API URL must be present **at web build time**. Runtime vars alone do not rewrite a previously built artifact. Keep same-origin browser routing for cookies. |
| D1/Drizzle | Four existing ordered migration directories, each with `migration.sql`. Local config has no migration discovery configuration. Drizzle config generates these files but does not specify remote account/database credentials. | Preserve files and use Wrangler's supported nested `migrations_pattern`; do not regenerate or manually replay untracked SQL on every deployment. |
| Auth | Better Auth 1.7.7, D1 adapter, signup disabled; session creation requires enabled/current email activation; trustedOrigins contains CORS_ORIGIN. Secure, HttpOnly, SameSite=lax cookies. Reset handler strictly checks CORS_ORIGIN. | Exact HTTPS staging web origin, separate auth secret, separate database, real staging email sender for activation tests. |
| Machine protocol | Signed v1 HMAC transport around strict v2 endpoints; SYNC_SECRET minimum32. | Separate staging machine secret and desktop test configuration. Desktop uses the **API Worker origin**, not the web origin. |
| Local environment | Web `.env` has NEXT_PUBLIC_SERVER_URL; server `.env` has auth/origin values; `.dev.vars` has auth and machine secrets. Values were not displayed. No Resend key/sender entry was found in those local files. | Do not copy local or production secrets. Worker runtime bindings come from staging config and uploaded secrets, not local `.env`. |
| Scripts/CI | Local integration tests exist; no `.github` workflow directory was found. `test:portal` seeds through local Wrangler; it is not a ready remote-staging runner. | Use existing isolated tests before deploy. Do not repoint `test:portal` to remote URLs; its local SQL fixture creation would mismatch the remote DB. Add a separate controlled staging test later. |

Installed versions inspected: Wrangler4.151.0, Next.js16.4.0, OpenNext Cloudflare1.20.11, Better Auth1.7.7, Alchemy declared2.0.0-beta.83, Bun project packageManager1.3.4. The lockfile should remain the deployment dependency source.

The installed Wrangler schema supports `migrations_pattern`, `secrets.required`, `--secrets-file`, `--env`, `--env-file`, and deploy dry-run. Installed OpenNext help confirms build/deploy `--config` and `--env`.

## Proposed isolated resources

| Resource | Proposed exact name |
| --- | --- |
| D1 | `store-managment-communal-web-staging` |
| Hono API Worker | `store-managment-communal-web-api-staging` |
| Next.js Worker | `store-managment-communal-web-web-staging` |

Use the selected Cloudflare account ID and its existing Workers subdomain. Proposed origins:

```text
API: https://store-managment-communal-web-api-staging.<WORKERS_SUBDOMAIN>.workers.dev
WEB: https://store-managment-communal-web-web-staging.<WORKERS_SUBDOMAIN>.workers.dev
```

`<ACCOUNT_ID>`, `<WORKERS_SUBDOMAIN>`, `<STAGING_D1_ID>` and `<VERIFIED_STAGING_SENDER>` are unresolved non-secret values, not guessed values. Account/subdomain can be read from the Cloudflare dashboard or existing authenticated CLI account information. Confirm that all proposed names are unused; if already present, stop and establish ownership rather than overwrite. No remote inventory was queried during this review.

Initial setup uses workers.dev, without custom routes/domains or production DNS changes. Both Workers are separate deployments. Staging D1 starts empty, using synthetic employee/products/requests only; no production database copy. For Desktop testing use a separate desktop test SQLite database/profile with synthetic stock and a new machine ID. Separate D1 does not isolate a desktop that still opens its real operational SQLite database.

Keep Alchemy as the existing production owner; use explicit staging-only Wrangler files for this test environment. Do not later import/manage these staging resources with Alchemy without a deliberate state/ownership plan. This changes deployment ownership for these new resources, not the application architecture. If infrastructure policy requires Alchemy for staging too, prepare an isolated Alchemy stack/state review first rather than run its current stack.

## Proposed configurations — not installed yet

Create these two files only after this proposal is accepted. Existing Wrangler files remain unchanged. In each config the top-level Worker name is also staging-only, while every command explicitly selects `--env staging`. This provides a safe target if an environment flag is accidentally omitted. Bindings and variables are declared under staging, because those fields are not inherited into named Wrangler environments.

`apps/server/wrangler.staging.jsonc`:

```jsonc
{
  "$schema": "../web/node_modules/wrangler/config-schema.json",
  "name": "store-managment-communal-web-api-staging",
  "account_id": "<ACCOUNT_ID>",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-14",
  "compatibility_flags": ["nodejs_compat"],
  "env": {
    "staging": {
      "name": "store-managment-communal-web-api-staging",
      "workers_dev": true,
      "preview_urls": false,
      "vars": {
        "BETTER_AUTH_URL": "https://store-managment-communal-web-api-staging.<WORKERS_SUBDOMAIN>.workers.dev",
        "CORS_ORIGIN": "https://store-managment-communal-web-web-staging.<WORKERS_SUBDOMAIN>.workers.dev",
        "RESEND_FROM": "<VERIFIED_STAGING_SENDER>"
      },
      "secrets": {
        "required": ["BETTER_AUTH_SECRET", "SYNC_SECRET", "RESEND_API_KEY"]
      },
      "d1_databases": [{
        "binding": "DB",
        "database_name": "store-managment-communal-web-staging",
        "database_id": "<STAGING_D1_ID>",
        "migrations_dir": "../../packages/db/src/migrations",
        "migrations_pattern": "../../packages/db/src/migrations/*/migration.sql"
      }]
    }
  }
}
```

`BETTER_AUTH_URL` deliberately stays the API origin as in the existing Alchemy architecture. Better Auth email links may pass through that API before redirecting to the web activation/reset page. Browser login/reset requests continue through the web proxy. Test proxy Set-Cookie, incoming Origin, reset redirects and secure-cookie persistence in the deployed runtime before declaring staging healthy.

`apps/web/wrangler.staging.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "store-managment-communal-web-web-staging",
  "account_id": "<ACCOUNT_ID>",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-14",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {"directory": ".open-next/assets", "binding": "ASSETS"},
  "env": {
    "staging": {
      "name": "store-managment-communal-web-web-staging",
      "workers_dev": true,
      "preview_urls": false,
      "vars": {
        "NEXT_PUBLIC_SERVER_URL": "https://store-managment-communal-web-api-staging.<WORKERS_SUBDOMAIN>.workers.dev"
      },
      "images": {"binding": "IMAGES"},
      "services": [{
        "binding": "WORKER_SELF_REFERENCE",
        "service": "store-managment-communal-web-web-staging"
      }]
    }
  }
}
```

The web Worker receives no D1 binding or auth/machine/email secrets. IMAGES preserves the existing architecture; actual use may depend on account entitlement. Do not silently enable a paid feature if binding validation fails. Diagnose/approve any entitlement change separately. No R2 cache or new cache schema is introduced here.

## Compatible build workflow

Use WSL2 **with the workspace on the Linux filesystem**, a Linux VM, or an Ubuntu CI runner. Transfer the complete reviewed working tree, including currently uncommitted application changes; cloning an old commit alone would omit this implementation. Install dependencies fresh on Linux; do not copy Windows node_modules, `.next`, `.open-next`, `.dev.vars`, private `.env` or Alchemy state. Use a currently supported Node LTS satisfying the installed Next.js engine requirement (Node24 is the recommended candidate) and Bun1.3.4; keep `bun.lock` unchanged.

The previous normal Next.js/server builds passed, but OpenNext failed on this Windows machine with EPERM while deleting `.open-next` and earlier while creating bundle symlinks. Native cleanup also encountered a locked assets directory. This is a build-host limitation, not evidence of failed Wrangler authentication. Do not kill unrelated processes, bypass supported-version checks, or change application runtime to Edge as a workaround. OpenNext documents Next.js16 support and recommends WSL/Linux/CI for Windows users.

Wrangler's Windows OAuth session is not necessarily available in a WSL/Linux home. On the chosen build/deployment host, check authentication using `wrangler whoami`. If that distinct host needs authentication, log in there or configure a narrowly scoped Cloudflare API token/account ID through its secret store. Do not print or transfer OAuth/token files through logs. CI should be a manually approved staging-only job, with scoped API-token permissions for these Workers and D1, not automatic production deployments.

## Exact commands — run only after approval

Commands below use **Bash on the chosen Linux host**, from the complete reviewed repository root. Replace the public placeholders first. They do not use root `bun run deploy`, Alchemy, the default web config or the local-only server config.

### 1. Local preflight and target configuration

```bash
# Start in the repository root on Linux.
bun install --frozen-lockfile --ignore-scripts
bun run check-types
bun run test:exchange
bun run test:portal:isolated

# Absolute helper paths keep commands independent of later cd operations.
export STAGING_REPO="$PWD"
export STAGING_API_URL='https://store-managment-communal-web-api-staging.<WORKERS_SUBDOMAIN>.workers.dev'
export STAGING_WEB_URL='https://store-managment-communal-web-web-staging.<WORKERS_SUBDOMAIN>.workers.dev'
wrangler_staging() { node "$STAGING_REPO/apps/web/node_modules/wrangler/bin/wrangler.js" "$@"; }

# Empty explicit env file prevents Wrangler falling back to private local env files.
export STAGING_EMPTY_ENV="$(mktemp)"
chmod 600 "$STAGING_EMPTY_ENV"
wrangler_staging whoami --env-file "$STAGING_EMPTY_ENV"
```

`whoami` is read-only and can show account metadata but not a secret value. Confirm the account matches the pinned account_id. CLI authentication is already known to work on Windows; this check is only for the selected deployment host.

Create/review the proposed config files locally. For a no-cloud preflight before D1 creation, temporarily use `00000000-0000-0000-0000-000000000001` as the staging-only DB ID. This is for **local validation only**; replace it with the real newly created ID before any remote command. Inspect the nested migration discovery without cloud writes:

```bash
wrangler_staging d1 migrations list DB --local \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV" --persist-to "$STAGING_REPO/tmp/staging-preflight"
```

The initial list must contain all four migration names below. If it does not, stop and fix discovery. This local command may initialize a local D1/migration tracking file; it does not access production.

### 2. Prepare independent secrets without displaying them

Required server secrets:

| Secret | Source/usage |
| --- | --- |
| BETTER_AUTH_SECRET | New independent cryptographically random staging value; never production/local reuse. |
| SYNC_SECRET | Different new independent random staging value; securely provision this same value only to the desktop **test profile**. |
| RESEND_API_KEY | Staging-restricted sending credential for an approved verified sender; no production mailing workflow. |

`RESEND_FROM` is a non-secret config variable such as `Portal Staging <address@verified-domain>`; CORS_ORIGIN/BETTER_AUTH_URL are non-secret HTTPS URLs. NEXT_PUBLIC_SERVER_URL is public and must be exported at build time. No Cloudflare API token is a Worker runtime secret; it belongs only to the deployment host/CI.

Create a restricted secrets file **outside the repository**, using masked input for the mail key. Do not `cat` it, put secret values into command arguments, use `set -x`, or paste them into the chat:

```bash
export STAGING_SECRETS_DIR="$(mktemp -d)"
chmod 700 "$STAGING_SECRETS_DIR"
export STAGING_SECRETS_FILE="$STAGING_SECRETS_DIR/server-secrets.json"
python3 - <<'PY'
import getpass, json, os, secrets
path = os.environ['STAGING_SECRETS_FILE']
mail_key = getpass.getpass('Staging Resend API key (hidden): ')
if not mail_key.strip():
    raise SystemExit('A staging sending credential is required for account lifecycle tests.')
values = {
    'BETTER_AUTH_SECRET': secrets.token_urlsafe(48),
    'SYNC_SECRET': secrets.token_urlsafe(48),
    'RESEND_API_KEY': mail_key,
}
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump(values, output)
PY
```

Store the generated values in the approved password/secret manager and securely provision the desktop test machine before removing the temporary file. Rotation changes sessions and/or machine connectivity; do not regenerate on every redeployment. The file must never be committed or copied into web build output.

### 3. Build locally before cloud creation/deployment

```bash
export NEXT_PUBLIC_SERVER_URL="$STAGING_API_URL"
export NODE_ENV=production

wrangler_staging deploy --dry-run --autoconfig=false \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV" --outdir "$STAGING_REPO/tmp/staging-api-bundle" \
  --secrets-file "$STAGING_SECRETS_FILE"

(
  cd "$STAGING_REPO/apps/web"
  node node_modules/@opennextjs/cloudflare/dist/cli/index.js build \
    --config wrangler.staging.jsonc --env staging
)

wrangler_staging deploy --dry-run --autoconfig=false \
  --config apps/web/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV" --outdir "$STAGING_REPO/tmp/staging-web-bundle"
```

These are local build/bundle checks, not deployments. Keep the staging secret file outside the output directories. Confirm generated rewrites contain the staging API origin and not localhost or a production hostname. The web artifact must be rebuilt if STAGING_API_URL changes. An OpenNext build failure or binding validation failure stops the run; do not use its unsafe unsupported-version flag.

### 4. Create the new remote staging D1 — cloud write

```bash
wrangler_staging d1 create store-managment-communal-web-staging \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV"
```

Copy only the returned new database UUID into `env.staging.d1_databases[0].database_id`. Verify name/account/UUID and ensure it is not an existing production UUID. The creation output contains resource IDs, not application secrets. Never leave the local preflight dummy UUID in a remote config. Creation must succeed as a new isolated database; if the name already exists, do not attach to it without reviewing its contents/ownership.

### 5. Apply the existing migrations to that staging D1 — cloud write

```bash
wrangler_staging d1 migrations list DB --remote \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV"

wrangler_staging d1 migrations apply DB --remote \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV"

wrangler_staging d1 migrations list DB --remote \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV"
```

Retain and apply in order:

1. `20261014093635_numerous_lethal_legion/migration.sql`: base auth/portal/catalogue/rate-limit/sync schema and indices.
2. `20261014094240_omniscient_sway/migration.sql`: invited_at.
3. `20261014120525_aromatic_korath/migration.sql`: exchange receipts, claims, reconciliation, staging, revision-bound reset/invitation tables and added fields.
4. `20261014121522_reflective_zodiak/migration.sql`: publication fingerprints, historical version/import backfill, grandfather activation, intentional invalidation of unbound legacy reset links.

No migration needs to be edited. Wrangler tracks names relative to migrations_dir (`<directory>/migration.sql`). Use this same Wrangler tracker for later staging migrations; do not mix raw SQL execution, Drizzle's separate migration tracker and Alchemy's tracker against this D1. A new empty staging DB avoids conflicting prior trackers. Do not run `db:migrate:deploy` or root deploy as a substitute.

### 6. Deploy server with staging secrets, then web — cloud writes

```bash
wrangler_staging deploy --autoconfig=false \
  --config apps/server/wrangler.staging.jsonc --env staging \
  --env-file "$STAGING_EMPTY_ENV" --secrets-file "$STAGING_SECRETS_FILE"

(
  cd "$STAGING_REPO/apps/web"
  node node_modules/@opennextjs/cloudflare/dist/cli/index.js deploy \
    --config wrangler.staging.jsonc --env staging \
    --env-file "$STAGING_EMPTY_ENV" --autoconfig=false
)
```

The deploy secret-file option uploads required secret bindings alongside the first API code version, avoiding a partially configured public API. It does not embed them in source. OpenNext deploy uses the already-built artifact from step3 and forwards Wrangler options. Do not rebuild it without the staging build-time URL.

Later secret rotation, **after approval**, uses masked Wrangler prompts:

```bash
wrangler_staging secret put BETTER_AUTH_SECRET --config apps/server/wrangler.staging.jsonc --env staging --env-file "$STAGING_EMPTY_ENV"
wrangler_staging secret put SYNC_SECRET --config apps/server/wrangler.staging.jsonc --env staging --env-file "$STAGING_EMPTY_ENV"
wrangler_staging secret put RESEND_API_KEY --config apps/server/wrangler.staging.jsonc --env staging --env-file "$STAGING_EMPTY_ENV"
```

Each `secret put` is itself a remote update and immediate deployment; it is not a read-only setup command. Secret listing can show names/types but should never be replaced with printing values.

### 7. Controlled staging validation

```bash
curl --fail --silent --show-error "$STAGING_API_URL/"
curl --fail --silent --show-error --output /dev/null "$STAGING_WEB_URL/login"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "$STAGING_API_URL/api/sync/v2/capabilities"
```

Expected: API root200 `OK`; web login200; unsigned capabilities401. Signed capabilities must be tested using the desktop's existing signer/secure credential storage, and must report schemaVersion2/signingVersionv1. Do not send a secret in a curl URL or header as plain authentication; the protocol uses HMAC timestamp/nonce/body hashing.

Then use a dedicated desktop test profile to publish synthetic employees/catalogue, verify one approved real invitation/activation at a controlled test inbox, login via web, submit a request, claim/import it, test pre-import cancellation and post-import operator-only cancellation, exact retries, disposition, terminal reconciliation and restore fencing. Verify no duplicate stock action in the test desktop SQLite. Redact cookies/reset links/HMAC credentials from reports. Never seed real employees or bulk invitations as a smoke test.

If Cloudflare Access is added later, desktop API requests would also need its service authentication. This proposal introduces no Access policy changes; HMAC protects machine routes and Better Auth protects employee data. Prefer a stable staging hostname over deployment-version previews for auth-cookie and origin tests.

## Approval boundary and unresolved inputs

Before cloud work: approve the two isolated config definitions and Wrangler ownership choice, confirm account/Workers subdomain, select verified staging sender/key, and select Linux/WSL/CI execution host. Local Linux adapter build and dry-run must pass before remote creation/deployment. Existing Windows Wrangler authentication alone does not resolve the OpenNext build limitation.

No production bindings/routes/resources are present in the proposed files. No production resource/data mutation, Alchemy operation, cloud creation/deploy, remote migration, secret upload or email send was performed for this review. Only this review document was added locally.

## Documentation checked

- [Cloudflare D1 nested migration layouts](https://developers.cloudflare.com/d1/reference/migrations/#nested-migration-layouts): migrations_dir + migrations_pattern preserve nested Drizzle files.
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/): environment-specific vars/bindings and `--env`.
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/): required secrets, deploy-time secret files and immediate deployment on secret put.
- [OpenNext CLI](https://opennext.js.org/cloudflare/cli): explicit configuration/environment build/deploy options.
- [OpenNext Cloudflare support](https://opennext.js.org/cloudflare): Next16 compatibility, Windows support limits and Linux/WSL/CI recommendations.

Installed CLI help/schema was checked alongside these docs. Commands/configs have not yet been exercised against real Cloudflare staging resources; that awaits approval and the missing public identifiers.
