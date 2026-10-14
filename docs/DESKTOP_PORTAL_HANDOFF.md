# Desktop integration handoff — gestion-du-magasin-communal

Prepared from a read-only inspection of both repositories on 14 October 2026.

## Message to the desktop project chat

Implement the desktop side of the employee request portal integration in:

C:\Users\Lenovo\my projects\gestion-du-magasin-communal

The portal repository is:

C:\Users\Lenovo\my projects\store-managment-communal-web

Keep the desktop SQLite database authoritative for employees, products, official requests, stock, reservations, valuation, deliveries and PDFs. Cloudflare D1 is an exchange database. Preserve existing domain services and the generated desktop architecture. Implement focused modules, migrations, backend RPC and Arabic/French UI. Do not recreate stock processing in a sync module.

Read the actual portal contracts and handlers listed below before implementation. This handoff distinguishes current implemented endpoints from missing protocol features. Develop the safe desktop work, test it, and produce the integration report specified at the end. For unresolved protocol gaps, document the exact required portal changes instead of fabricating successful acknowledgements, references or cancellation outcomes. Do not deploy, provision paid services or send real invitations as part of automated tests.

## 1. What already exists in the desktop

Paths below are relative to the desktop repository.

- apps/desktop/src/bun/requests/service.ts exposes createRequest, createRequestInTransaction, acceptRequestInTransaction, rejectRequestInTransaction, cancelRequestInTransaction and finalizeRequestDeliveryInTransaction.
- Requests already contain source_external_id and the database has the partial unique index idx_requests_source_external_id_unique. Existing findRequestByExternalId supports duplicate detection. Reuse these; do not add a second independent request identity.
- Employee and product services generate stable UUIDs.
- packages/magasin/src/types.ts defines statuses PENDING, REJECTED, ACCEPTED, CANCELLED_BEFORE_DELIVERY and DELIVERED_SIGNED.
- Quantities are stored as integer milliunits; QUANTITY_SCALE = 1000. Use existing validation and conversion helpers. Cloud quantities are ordinary decimal units, not milliunits.
- apps/desktop/src/bun/stock/stock-queries.ts exposes getProductStocksForProducts and availableMilliunits.
- apps/desktop/src/bun/backups/coordinator.ts provides OperationCoordinator. Existing RPC work uses backups.coordinator.ordinary.
- apps/desktop/src/bun/backups/restore.ts provides DatabaseOwner, owner.db and owner.generation. Restore closes/reopens the database and changes its generation.
- Migration 0010 introduced old employee-access tables/jobs; 0011 added invitation intent. Migration 0012 intentionally disabled the old Google integration, removed its employee triggers and cancelled queued jobs while retaining historical records. Those historical tables do NOT prove a live portal outbox exists. Do not reactivate Google functionality or assume its jobs are compatible.
- Existing synchronization settings only accept intervals 5, 10, 15, 30 and 60 minutes. Add support for 2 minutes in the type, Zod schema, defaults, UI and tests if adopting the selected portal polling interval.

## 2. Implement configuration and credential storage

Add a dedicated portal integration configuration:

- Enabled flag, portal API base URL and sync interval (default approximately 2 minutes).
- Protected reference to the machine secret, connection state, last successful sync, last attempt and safe error category.
- Configure the URL of the Hono API Worker, not the Next.js web site. Local development API is http://localhost:3000; deployed API URL is still to be supplied.
- Use HTTPS in production; permit localhost HTTP explicitly for development.
- Store SYNC_SECRET in protected desktop backend storage appropriate to the installed runtime and OS. Never expose it through renderer RPC responses, frontend environment variables, logs, screenshots or the report.
- The same secret must be configured server-side in the portal Worker. Never derive it from an employee password/session.
- The desktop does not need a Cloudflare API token, direct D1 access or a Resend key. The portal sends account invitations and reset emails.
- Configuration/test-connection failures must not block ordinary local work.

Report the chosen secret storage mechanism, its limitations and how credentials are rotated without returning their values.

## 3. Build a signed backend HTTPS client

Current portal source of truth:

- apps/server/src/sync/contracts.ts
- apps/server/src/sync/authorization.ts
- apps/server/src/sync/signature.ts
- apps/server/src/sync/employees.ts
- apps/server/src/sync/catalogue.ts
- apps/server/src/sync/requests.ts

Each request needs:

| Header | Value |
| --- | --- |
| X-Sync-Timestamp | Unix milliseconds, 13 digits; within five minutes of server time |
| X-Sync-Nonce | Fresh lowercase UUID for every HTTP attempt |
| X-Sync-Signature | Lowercase hexadecimal HMAC-SHA256 |
| Content-Type | application/json for JSON bodies |

Sign this exact UTF-8 string, joined with LF and without a trailing LF:

~~~text
v1
METHOD
/api/sync/path
TIMESTAMP
NONCE
LOWERCASE_HEX_SHA256_BODY
~~~

Hash and transmit the same exact serialized body bytes. GET uses an empty body. Sign only the URL pathname, matching current implementation. Serialize once; do not sign one JSON representation and send another.

All bodies use schemaVersion: 1. Current maximum body size is 256 KiB. Configure request timeouts, cancellation, bounded exponential retries and jitter. A retry uses a new nonce but retains the same entity IDs, versions and logical operation. Handle 400 as a contract failure, 401 as credentials/signature/clock failure, 409 as nonce replay, and 503 as unconfigured/unavailable sync. Do not repeatedly retry permanent errors at full speed.

## 4. Add durable outbox and sync state

Use additive SQLite migrations and explicit indexes. Keep the existing external-ID constraint.

Suggested responsibilities, adapted to the actual schema:

- Employee publication revision and pending operations.
- Durable catalogue snapshot/version.
- Request import receipt linking external UUID to official local request ID/number.
- Outgoing request-status revisions/outbox.
- Cancellation intent receipt and processing outcome.
- Safe sync-run diagnostics and retry scheduling.
- Restore/reconciliation state.

Employee/request mutations and their outbox events must commit together. Persist successful local imports and their outgoing acknowledgements in one transaction. If a process dies after local commit but before cloud acknowledgement, the next run must reuse the existing official request and resend the acknowledgement.

Versions must be positive, strictly increasing safe integers for each employee, each cloud request and the full catalogue. Do not rely exclusively on a counter in restorable SQLite or a bare Date.now value. Explain how retries, concurrent work, clock rollback and restoring an older backup cannot produce a reused/lower publication version. Recovery may require portal high-water-mark APIs; see section 10.

## 5. Publish employees

POST /api/sync/employees

~~~json
{
  "schemaVersion": 1,
  "employees": [
    {
      "localEmployeeId": "desktop-employee-uuid",
      "name": "Employee name",
      "email": "employee@example.test",
      "enabled": true,
      "version": 1,
      "invite": true
    }
  ]
}
~~~

The example UUID placeholder must be replaced with a real UUID. Maximum 50 employees per request.

- Map desktop ACTIVE to enabled true and ARCHIVED to enabled false. If access opt-out is supported, account for it explicitly.
- Publish creation, name/email edits, archive and reactivation.
- Enqueue existing employees on first enablement without requiring manual edits.
- invite defaults to true; use false in synthetic tests.
- The portal uses an invitation/reset token so an employee chooses the first password. Desktop must never generate or email an employee password.
- A result is returned per employee: acknowledged, stale or retry. HTTP 200 alone is not success for the whole batch. Only clear a matching revision after acknowledged.
- Current portal invitation tracking prevents repeated initial sends once marked sent. Account activation/delivery status and explicit invitation resend are not exposed by this API. Do not label an account “activated” from a publication acknowledgement.
- Audit email changes carefully: the current portal updates an existing auth user's email, but active email-change session revocation/reverification is not a complete protocol. Report the required portal behavior; do not claim this flow is hardened.

## 6. Publish the available-product catalogue

POST /api/sync/catalogue

~~~json
{
  "schemaVersion": 1,
  "version": 1,
  "products": [
    {
      "id": "desktop-product-uuid",
      "label": "Product name",
      "unit": "Unit",
      "available": true
    }
  ]
}
~~~

This is a COMPLETE snapshot, currently maximum 500 products. Omitted products become unavailable. Do not send successive partial chunks as complete snapshots: that would hide previous chunks.

- Derive availability using the existing authoritative stock calculation, normally ACTIVE and availableMilliunits > 0. Confirm the exact business rule and report it.
- Publish IDs, display labels, units and availability only. Never publish stock counts, balances, purchase costs, CMP or valuation.
- Trigger catalogue changes after product edits/archive, stock entries, initial-stock imports, acceptance/reservation, cancellation/releases, delivery, resets and restore as applicable.
- Coalesce multiple changes into a consistent snapshot; an empty available catalogue is valid.
- Avoid stale remote publication after a restore or superseded local snapshot.
- Current limits differ: desktop units allow up to 80 characters, portal accepts 50. Detect/report this mismatch; do not silently truncate identity/display data. If the catalogue exceeds 500 items or 256 KiB, report a required staged-snapshot protocol instead of splitting unsafely.
- Response contains schemaVersion and the current catalogue version; compare it with the attempted version.

## 7. Import incoming requests without changing stock

GET /api/sync/requests returns at most 50 oldest queued requests/cancellation intents.

Each record includes cloud id (external UUID), employeeId (cloud auth ID), localEmployeeId (desktop employee UUID), status, localReference, canCancel, cancelRequestedAt, createdAt/updatedAt in Unix milliseconds, stateVersion, note, and items with productId, quantity, label, unit and requestId.

- Resolve the employee using localEmployeeId. Never use cloud employeeId as a desktop identity.
- Resolve products using UUIDs. Treat labels/units as untrusted snapshots and use existing official product data for domain operations.
- Check the stable external ID first. If already imported, return the existing official mapping; do not call createRequest again.
- Revalidate active employee, products, duplicate items, positive finite quantity and representability in milliunits.
- Cloud currently permits decimals that are not representable at three decimal places. Reject/quarantine unsupported precision rather than silently rounding. Report the needed portal precision validation.
- Map item.quantity to quantityRequested and cloud.id to sourceExternalId. Reuse createRequestInTransaction within the existing transaction machinery.
- The existing request creation service checks active products but does not reserve stock. Define and report how changed availability is handled at import; do not accidentally auto-accept/reserve.
- Preserve the employee note in import metadata or an approved additive request field: existing CreateRequestInput does not expose a note field.
- Import receipt and outgoing status must commit with the official request before any cloud acknowledgement.
- Process bounded batches and per-record failures without losing successful work or keeping a local transaction open during network I/O.

## 8. Publish official statuses

POST /api/sync/requests/statuses, maximum 50 records:

~~~json
{
  "schemaVersion": 1,
  "requests": [
    {
      "id": "cloud-external-request-uuid",
      "version": 1,
      "localReference": "official-local-request-number",
      "status": "pending",
      "canCancel": false,
      "cancellationResolved": false
    }
  ]
}
~~~

| Desktop status | Portal status |
| --- | --- |
| PENDING | pending |
| REJECTED | refused |
| ACCEPTED | accepted |
| CANCELLED_BEFORE_DELIVERY | cancelled |
| DELIVERED_SIGNED | delivered |

Cloud submitted means not yet acknowledged by desktop; it is not an additional desktop stock-processing state.

Publish after import, acceptance, refusal, cancellation and completed delivery. localReference is the real requestNumber, not the local database row ID or a fabricated value. Only imported/cloud-origin requests need publication.

Current results are acknowledged or unchanged. unchanged conflates stale version, terminal-state protection and unknown ID. Do not treat every unchanged result as a verified equivalent remote state; retain diagnostics and request reconciliation details where necessary.

## 9. Reconcile cancellation through domain services

An imported cloud cancellation is an intent; never delete official requests or directly edit stock/reservations.

IMPORTANT mismatch discovered during audit:

- Portal currently permits employee cancellation for submitted or pending requests and forces canCancel false for accepted statuses.
- Desktop cancelRequestInTransaction only accepts ACCEPTED requests and releases their reservations; it does not cancel PENDING requests.
- Therefore the current integrations cannot claim compatible employee cancellation simply by setting canCancel true on desktop PENDING records.

Preserve existing accepted-request cancellation logic. Propose and implement a justified pending-cancellation domain operation only if required by the agreed workflow; otherwise return canCancel false for pending imports and report the portal changes needed for any accepted-before-delivery employee cancellation. Do not convert pending requests into accepted requests just to reuse cancellation.

For each intent, re-read current local state inside the transaction, apply the allowed domain operation or reject the intent, persist its receipt/outcome, and enqueue the authoritative status with cancellationResolved true when actually resolved. Handle races with acceptance/delivery and retry duplicate intents without duplicate reservation release.

## 10. Protocol gaps requiring coordination with the portal project

These are NOT implemented endpoints. Report proposed contracts and do not work around them by lying about outcomes.

1. Invalid inbound requests before a local request exists: the current status endpoint requires a nonempty localReference. Missing/archived employee or invalid product/precision may prevent local creation. Need a machine disposition/rejection endpoint accepting an external UUID, outcome and safe reason without a local reference. Poison records must not permanently occupy the oldest-50 queue and starve newer requests.
2. Import/cancellation race: a desktop may pull a submitted request, then the employee cancels it in D1 before desktop acknowledgement. Current cancelled cloud rows refuse later pending/accepted updates. Need an agreed claim/recheck/commit or reconciliation protocol before stock-affecting processing; local UUID deduplication alone does not close this race.
3. Restore reconciliation: current GET only returns queued submissions and outstanding cancellation intents. It does not expose all historical/imported records or per-entity version high-water marks. Need authenticated lookup/reconciliation of external IDs, states, local references, employee/catalogue/request versions and relevant cancellation outcomes. Restored pending records must not override remotely delivered/cancelled outcomes.
4. Cancellation eligibility mismatch described above.
5. Precise results for status unchanged and employee stale, including remote versions/state, to distinguish safe idempotent retries from conflicts.
6. Quantity precision, unit-length limits and oversized complete snapshots.
7. Account lifecycle visibility, invitation resend semantics and safe email-change behavior.

List each gap in the report with minimal request/response examples and a compatibility test. The portal project will implement/review those changes before a full live end-to-end connection is declared complete.

## 11. Scheduler, restore and UI

- One sync run at a time; startup, approximately two-minute polling while open, and manual “Synchroniser maintenant”.
- Use lifecycle shutdown to cancel timers and abort network calls.
- Use the existing coordinator for local DB work and obtain owner.db when needed. Do not retain prepared statements/connections across restore.
- Capture owner.generation when preparing work; discard/reconcile stale network responses if the generation changes before commit. Do not hold SQLite transactions during HTTP calls.
- On restore, pause/drain synchronization, cancel in-flight work, reopen through DatabaseOwner, mark reconciliation required and resume only after safe reconciliation.
- Preserve normal offline local operations. Distinguish disabled, syncing, connected, offline, error and reconciliation-required states.
- Add focused settings, status summary, last-success/error information, retry/manual-sync controls and safe per-record diagnostics.
- Existing request-source badge already distinguishes CLOUD from LOCAL. Reuse it in received requests.
- Keep credentials backend-only and remove secrets/tokens/raw personal payloads from diagnostic exports.

## 12. Required tests and completion report

Test migrations from the existing latest schema and representative older backups, preserving Google-removal migration history.

Test signed client compatibility with the actual portal verifier, timeout/offline/retry, fresh nonces, duplicate delivery, crash after commit before acknowledgement, disabled employees, catalogue completeness, milliunit precision, failed imports, status transitions, cancellation races, restore during HTTP work and shutdown. Verify no cloud operation autonomously reserves/delivers stock.

Run project-native build/typecheck/lint and relevant Bun tests. Use synthetic employees and local Worker/D1; do not send real email during tests.

Produce DESKTOP_PORTAL_INTEGRATION_REPORT.md containing:

1. Implementation summary and exact changed/new files.
2. Commands run with pass/fail results and test names.
3. SQLite migration IDs, tables/indexes and outbox transaction boundaries.
4. Exact DTOs/JSON examples and endpoint usage for employee/catalogue/request/status/cancellation flows.
5. Status mapping, cancellation rules, precision and catalogue availability calculations.
6. Secret-storage mechanism and configuration instructions (no secret values).
7. Scheduler, retry, duplicate prevention, startup/shutdown and offline behavior.
8. Version generation, database-generation fencing and backup/restore reconciliation.
9. Implemented features vs remaining blockers and required portal API changes, with proposed contracts.
10. Local test API URL/ports, synthetic fixture setup and an end-to-end reproduction script.
11. Any departure from this handoff with its reason.
12. Commit IDs if commits were made; never claim a live integration until both sides have passed connection tests.

Return that report to the user to bring back to the portal project chat. Do not claim unsupported protocol flows as complete.

## Portal connection review afterward

Once the report returns, the portal project will compare the actual DTOs, address the protocol gaps, supply/confirm the API URL and secret provisioning process, and test employee activation, catalogue publication, multi-item submission, official import, decisions, cancellation, offline retries and restore end to end.

