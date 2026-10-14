# Employee request portal implementation

The existing Next.js + Hono/tRPC + D1/Drizzle + Better Auth + Bun/Turborepo scaffold is retained. The supplied solution document informed the product and architecture; its deployment, commit and desktop-work instructions were not treated as independent user authorization.

## Implemented

- shadcn New York (Radix) components in the existing shared UI package. Both components.json files use new-york and rtl: true; the shadcn RTL migration has been applied.
- Arabic by default, French switcher, persisted language cookie, server-rendered html lang/dir, DirectionProvider, logical spacing and Noto Sans Arabic. Labels and statuses translate; product names and units remain the desktop's published display data.
- Responsive dashboard, searchable available catalogue, multi-line request selection, positive decimal quantities, optional note, history of the latest 50 requests, details, cancellation confirmation, account profile and sign-out.
- Invite-only login, activation and password reset screens. Better Auth public registration is disabled. Accounts are provisioned exclusively through the machine API. New provisioned employees receive a reset-token invitation to choose their first password; invitation tracking avoids repeated messages. Failed sends can be retried.
- Employee account-enabled checks on session creation and every protected procedure. Disabling an employee revokes sessions.
- Atomic D1 batch request creation, per-employee idempotency keys and immutable item display snapshots; mismatched retries are rejected. Catalogue responses contain only product id, label and unit, with a publication timestamp.
- Own-request access checks, cancellation while allowed, database submission throttling and Better Auth database rate limits.
- Signed, versioned desktop exchange API with bounded payloads and nonce replay protection. Desktop acknowledgements must be sent after durable local processing.
- Next.js rewrites proxy /api/auth and /trpc to the existing Hono Worker. Browser requests and cookies use the portal origin, avoiding cross-site cookie reliance between separate workers.dev hosts.
- SQL migrations are generated in packages/db/src/migrations. Alchemy supports the installed Drizzle v1 directory layout.

## File boundaries

- apps/web/src/components/portal: feature components (catalogue, quantity control, selection, history, details, cancellation, dashboard, shell and query states).
- apps/web/src/components/auth: auth layout and focused password/reset forms.
- apps/web/src/lib/i18n: French/Arabic dictionary and direction provider.
- packages/api/src/routers: catalogue and request procedures; contracts and rate limits live separately.
- packages/db/src/schema: auth, employee, catalogue, request, sync and rate-limit tables.
- apps/server/src/sync: separate authorization, signature, contract, employee, catalogue and request modules.
- packages/auth/src/email.ts: Workers-compatible Resend transport.

## Local development

Set apps/web/.env NEXT_PUBLIC_SERVER_URL to http://localhost:3000. Set the following in an ignored apps/server/.dev.vars file:

- BETTER_AUTH_SECRET (at least 32 characters)
- SYNC_SECRET (at least 32 characters; use a different value)
- RESEND_API_KEY and RESEND_FROM only when testing actual email delivery

The local Wrangler configuration is explicitly for local development; production resources remain managed by Alchemy. Do not deploy the local configuration.

From the repository root:

~~~powershell
bun install
node apps/web/node_modules/wrangler/bin/wrangler.js d1 execute communal-portal-local --local --config apps/server/wrangler.local.jsonc --file packages/db/src/migrations/20261014093635_numerous_lethal_legion/migration.sql
node apps/web/node_modules/wrangler/bin/wrangler.js d1 execute communal-portal-local --local --config apps/server/wrangler.local.jsonc --file packages/db/src/migrations/20261014094240_omniscient_sway/migration.sql
bun run dev:server
bun run dev:web
~~~

Apply each migration only once to a new local database. Production migration bookkeeping is owned by Alchemy.

On this Windows installation, Bun's Varlock postinstall/codegen can crash with UV_HANDLE_CLOSING. Dependency installation completed using bun install --ignore-scripts. Node can run the installed Drizzle CLI successfully: from packages/db, run node node_modules/drizzle-kit/bin.cjs generate. The root Turbo migration task currently requires an interactive terminal.

## Desktop exchange contract (schemaVersion: 1)

All machine calls use these headers:

- X-Sync-Timestamp: current Unix milliseconds (13 digits; accepted within five minutes)
- X-Sync-Nonce: a new UUID per HTTP attempt
- X-Sync-Signature: lowercase hexadecimal HMAC-SHA256 using SYNC_SECRET

Sign the UTF-8 string below, separated by literal LF characters and with no trailing LF. Hash the exact transmitted UTF-8 body; GET uses an empty body.

~~~text
v1
METHOD
/api/sync/path
TIMESTAMP
NONCE
LOWERCASE_HEX_SHA256_BODY
~~~

Routes:

| Route | Contract |
| --- | --- |
| POST /api/sync/employees | schemaVersion; employees[] with localEmployeeId UUID, email, name, enabled, positive version, optional invite (default true). Per-employee result: acknowledged, stale or retry. Repeat retry results with a fresh nonce. |
| POST /api/sync/catalogue | schemaVersion, strictly increasing version and a complete products[] snapshot (maximum 500; UUID id, label, unit, available). Omitted products become unavailable. Stale snapshots cannot replace newer data. |
| GET /api/sync/requests | Up to 50 submitted requests or outstanding cancellation intents; includes external request UUID, stable localEmployeeId and item snapshots. Pull again after acknowledging each batch. |
| POST /api/sync/requests/statuses | schemaVersion; requests[] with id, increasing version, localReference, status, canCancel and optional cancellationResolved. Terminal states cannot reopen and accepted cannot regress to pending. |

Status codes: submitted, pending, accepted, refused, cancelled, delivered. The cloud can submit and cancel an unimported request. Imported requests retain their authoritative status while an intent awaits reconciliation.

The desktop must validate employee enablement, product availability and quantities again; deduplicate the external UUID using a durable unique constraint; use its existing request service and transactions; and acknowledge only after a durable local commit. Sync at startup, approximately every two minutes while running, and on manual sync. No desktop application exists in this repository, so its client, stock workflow and backup/restore reconciliation are not implemented here. Restored desktop snapshots must not reset cloud versions or reuse version counters: resynchronize current authoritative records and reconcile external IDs before processing.

## Verification

- bun run check-types: all seven workspace checks pass.
- bun run build: Next.js and Hono production builds pass.
- Local D1 migrations execute successfully through Wrangler.
- bun run test:portal: passes against the actual local Worker/D1 runtime. Exercises provisioning, first-password activation, persistent login, multi-item requests, retry idempotency/conflicts, employee ownership, unauthenticated access, invalid quantities, local and imported cancellation, signed-machine isolation, nonce replay, stale catalogue snapshots and employee disabling.
- Browser verification: Arabic RTL and French LTR, language persistence across reload, mobile width 390px with no document horizontal overflow, catalogue selection and submission.
- The smoke script only targets localhost and creates synthetic @example.test employees. It seeds a test-only reset token in local D1 instead of sending email. It prints a local test account for UI verification.

## Request catalogue on mobile and desktop

The request catalogue now uses server-side search and pagination (12 products per page, validated maximum 48). D1 filters and counts only available products, orders pages by label and stable ID, and treats search text literally. Search is debounced for 300 ms and resets to page one. Selections persist across page and search changes.

Desktop keeps the existing product cards and selection sidebar. Below the desktop breakpoint, products use compact rows with 44 px add controls; a fixed review button opens a scrollable, RTL-aware selection dialog for quantities, notes and submission. Controls have distinct IDs between the desktop sidebar and mobile dialog.

The local smoke test also verifies a catalogue with 37 available products: bounded pages, no overlapping IDs, exact search, page clamping, literal wildcard/injection text, unavailable-product exclusion and invalid page-size rejection. This synthetic catalogue remains in local D1 for responsive UI testing.

## Remaining production verification

The Cloudflare OpenNext build on this Windows host compiles Next.js successfully but fails during Worker bundle generation with EPERM when creating symlinks. OpenNext itself warns about Windows support. WSL is not installed. Re-run the Cloudflare build in WSL/Linux or an appropriate Linux CI runner; the web Worker deployment is not yet verified.

No live Cloudflare deployment or real Resend delivery was performed. Configure deployment secrets RESEND_API_KEY, RESEND_FROM and SYNC_SECRET in addition to the existing auth/environment inputs; use the verified sender domain. Validate invitations, resets, cookies, runtime CPU and quotas in a deployed preview before production. No paid plans or remote resources were enabled.

Desktop synchronization and restore reconciliation require implementation in the separate desktop repository and agreement on its exact identifiers, status rules and durable version generation.

