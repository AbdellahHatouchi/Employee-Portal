# Portal → desktop integration handoff

Finalized portal implementation, 14 October 2026. No production deployment has been performed.

Portal: `C:\Users\Lenovo\my projects\store-managment-communal-web`.
Desktop: `C:\Users\Lenovo\my projects\gestion-du-magasin-communal`.

This document supersedes the protocol-gap portions of `docs/DESKTOP_PORTAL_HANDOFF.md`. It does **not** assert that the desktop already understands these new responses. The desktop integration report supplied by the user describes a v1 client; upgrade and test that client before enabling v2 processing.

## 1. Authority, compatibility and deployment boundary

Desktop SQLite remains authoritative for employee/product identity, official requests, reservations, stock, valuation, delivery and PDFs. D1 stores published employee/catalogue data, employee submissions and synchronization evidence. Portal commits never debit, reserve or restore stock.

The five implemented work areas are precise publication acknowledgements; claims and pre-import dispositions; restore reconciliation; validation and catalogue alignment; secure account lifecycle. Existing Next.js, Hono, tRPC, Workers, D1, Drizzle and Better Auth remain in use. Handlers are separated under `apps/server/src/sync/v2`.

V2 is an explicit new namespace. Continue using v1 until the desktop has v2 parsers and the recovery logic below. Never parse a v2 response using the old acknowledged/unchanged parser. Do not switch protocols in the middle of an unresolved import.

**Cancellation rule:** employees may cancel a submitted request until its import commit wins in D1. A claim does not remove this right. Once committed, employees cannot cancel pending, accepted or delivered requests; the desktop operator controls cancellation through existing domain services. Sending `canCancel:true` cannot override this rule. The desktop must fence operator stock actions while an import outcome is unresolved.

## 2. Machine authentication

Every endpoint below, including capabilities, uses the existing HMAC authentication middleware. User sessions cannot substitute for machine authentication. HTTPS is required outside local tests. Store `SYNC_SECRET` in desktop secure storage and Worker secrets; do not expose it in browser code, logs or backups exported without protection. Minimum secret length is 32 characters.

Headers:

```text
Content-Type: application/json                 # POST
X-Sync-Timestamp: <13-digit Unix milliseconds>
X-Sync-Nonce: <fresh lowercase RFC UUID>
X-Sync-Signature: <64 lowercase hex characters>
```

Sign the UTF-8 encoding of the following six fields joined with LF, without a trailing LF:

```text
v1
<uppercase HTTP method>
<exact URL pathname, e.g. /api/sync/v2/requests/claims>
<timestamp header as sent>
<nonce header as sent>
<lowercase hex SHA-256 of the exact UTF-8 request body>
```

The signature is lowercase hexadecimal HMAC-SHA256 using the UTF-8 secret. An empty GET body hashes as the empty string. Signing version remains **v1**, even when the JSON contract is v2. Query strings are not signed: use the documented POST bodies for cursors and lookup parameters, and do not add application parameters to GET capabilities. Clock tolerance is ±300,000 ms. Nonces are inserted atomically in D1 and retained for 600,000 ms; a concurrent duplicate nonce has one winner.

Transport retries retain the identical operation UUID and application payload but use a fresh timestamp, nonce and signature. `machineId` is a stable installation UUID, persisted outside the restored desktop database where possible. It correlates receipts and owns leases/snapshots; it is not a second authentication factor. All holders of the shared secret are trusted machine clients, so do not configure two independent authoritative desktops against the same portal.

## 3. Common contracts and acknowledgement semantics

All POST objects and nested input objects are strict: unknown properties produce HTTP 400. JSON must use actual booleans/numbers, not strings. UUIDs use the validator's UUID format; the nonce header specifically requires lowercase UUID with a version nibble 1–8 and valid variant. Recommended UUID format for all fields is lowercase v4.

```ts
type Machine = { schemaVersion: 2; machineId: UUID };
type Operation = Machine & { operationId: UUID };
type Version = number; // safe integer 1..9_007_199_254_740_990
type StateVersion = number; // safe integer 0..9_007_199_254_740_990
type Product = {
  id: UUID;
  label: string;     // trimmed, 1..200 characters
  unit: string;      // trimmed, 1..80 characters
  available: boolean;
};
type RemoteRequest = {
  id: UUID;
  stateVersion: number;
  remoteVersion: number;
  status: "submitted" | "pending" | "accepted" | "refused" | "cancelled" | "delivered";
  localReference: string | null;
  canCancel: boolean;
  cancelRequestedAt: number | null;
  importedAt: number | null;
  claimId: UUID | null;
  dispositionReason: string | null;
};
```

Every v2 handler response includes `schemaVersion:2`. Shared authentication/body-limit failures may omit that field. All times are Unix milliseconds. Nullable fields are JSON `null`, not omitted, except where explicitly described below. No machine endpoint returns passwords, password hashes, session tokens, reset links or reset tokens.

`stateVersion` is the portal's concurrency revision and increments on claim, employee cancellation, disposition, import and status change. A renewal does not increment it. `remoteVersion` is the last desktop publication version and does not increment for claims/cancellation. Never substitute one for the other. The migration copies the old state version into the initial publication version.

Operations are globally identified by `operationId` and bind to their machine, operation kind and normalized complete payload. Receipts are committed in the same D1 batch as their mutation. Reusing the UUID with a different payload, machine or kind returns `operation-conflict`; it never performs that mutation. Operations in a batch each have their own receipt. A batch is a sequence of independent record transactions, not one all-or-nothing transaction. A 500 can occur after earlier records committed: retry every uncertain record with its original UUID.

`replayed:true` means an already-persisted receipt supplied the result, including a concurrent receipt-insert loser. Receipts are historical evidence of the exact attempt, **not a current-state read**. Reconciliation supplies current snapshot evidence. A replay may describe an earlier pending state even if the request is now delivered. The invitation endpoint separately appends live lifecycle data.

| Result | Desktop handling |
| --- | --- |
| `acknowledged` | Exact requested employee/status/catalogue/disposition publication was applied. Clear only the matching outbox attempt. |
| `equivalent` | Exact relevant publication was already present at this version (or same pre-import refusal reason). May clear only that matching attempt. |
| `committed` | The specific initial import or catalogue stage has committed. It does not authorize regression of its later state. |
| `stale` | A newer publication exists. Reconcile; never treat this as proof that the attempted payload is present. |
| `version-conflict` | Same version differs, or publication cannot match the requested version/payload. Reconcile and generate a reviewed newer publication; do not mutate an old operation. |
| `state-conflict` | State, reference, expected revision or claim ownership no longer permits the action. Fence affected stock actions and reconcile. |
| `unknown-id` | No matching remote identity exists. Investigate mapping; do not fabricate a successful status acknowledgement or local reference. |
| `operation-conflict` | UUID was reused inconsistently. Stop that attempt and correct the durable outbox identity. |
| `import-required` | Status endpoint cannot establish the initial official import. Use claim + import commit. |
| `email-conflict` | Another user owns the email. No partial identity update occurred; operator correction is required. |

Operation-conflict responses contain only `result` and `replayed`, plus per-record identity fields supplied by wrappers. Employee email-conflict responses also omit remote version/revision. Missing evidence is never success. Catalogue commit validation failures that occur before the transaction (`unknown-id`, `incomplete-snapshot`, `invalid-snapshot`, `snapshot-too-large`, `digest-conflict`) do not create a receipt or return `replayed`.

## 4. Endpoint catalogue

All paths below are rooted at `/api/sync/v2`. All are POST except capabilities. The complete route set has 17 routes.

### GET `/capabilities`

No application body. Response:

```json
{"schemaVersion":2,"signingVersion":"v1","employeeCancellation":"before-import-only","claimLeaseMs":300000,"reconciliationLeaseMs":1800000,"maxBatch":50,"maxBodyBytes":262144,"maxSnapshotProducts":10000,"maxChunks":100}
```

Negotiate explicitly. A missing/unsupported schema must leave the existing stock fence active. Catalogue stage lifetime is 3,600,000 ms; its aggregate canonical UTF-8 representation is additionally limited to 1,048,576 bytes.

### POST `/employees`

```ts
type Input = Machine & {
  employees: Array<{ // 1..50
    operationId: UUID;
    localEmployeeId: UUID;
    name: string; // trimmed 1..200
    email: string; // valid email, normalized lowercase
    enabled: boolean;
    version: Version;
    invite?: boolean; // default true
  }>;
};
type Response = {
  schemaVersion: 2;
  results: Array<{
    localEmployeeId: UUID;
    attemptedVersion: number;
    result: "acknowledged" | "equivalent" | "stale" | "version-conflict" | "unknown-id" | "email-conflict" | "operation-conflict";
    replayed: boolean;
    remoteVersion?: number | null;
    emailRevision?: number | null;
  }>;
};
```

Employee publication acknowledgement does **not** prove email delivery. If `invite:true`, an initial invitation is attempted only for an enabled, unactivated identity whose invitation state is `none`. Query lifecycle for its result. Renaming preserves activation; changing email increments email revision, revokes sessions/links and requires new activation. Disabling revokes sessions. Same-version conflicting publications cannot disable or revoke an unchanged account.

### POST `/catalogue`

Input: `Operation & { version:Version; products:Product[] }`, 0..500 products with unique product UUIDs. Empty products is a valid empty authoritative snapshot.

Response: `{schemaVersion:2,result,replayed,attemptedVersion?,remoteVersion?}`. Results: `acknowledged`, `equivalent`, `stale`, `version-conflict`, `operation-conflict`. Every missing prior product is made unavailable, not deleted. Publication is atomic. Product order does not affect catalogue equivalence, but an operation UUID still binds to its complete input array order. Above 500 products use staging; do not silently truncate a snapshot.

### POST `/requests/pull`

Input: `Machine & { after?:UUID|null; limit?:number }`. Defaults `after:null`, `limit:50`; limit 1..50.

Response:

```ts
{
 schemaVersion:2;
 requests:Array<RemoteRequest & {
   localEmployeeId:UUID|null;
   employeeId:string;
   note:string;
   createdAt:number;
   updatedAt:number;
   claim:{id:UUID;machineId:UUID;operationId:UUID;expiresAt:number;committedAt:number|null}|null;
   items:Array<{requestId:UUID;productId:UUID;quantity:number;label:string;unit:string}>;
 }>;
 nextCursor:UUID|null;
}
```

Only submitted/unimported requests are pulled. Sort is ascending request UUID, not creation time; use `nextCursor` exactly. Requests owned by another active claim may still appear, so inspect and respect claims. Advance past invalid/blocked records rather than repeatedly reading the oldest 50. Restart from `after:null` next polling cycle: newly created UUIDs can sort before the previous cursor. This is live pagination, not a historical snapshot. Cancellation/terminal history comes from reconciliation.

### POST `/requests/claims`

Input: `Operation & { id:UUID; expectedStateVersion:StateVersion }`.

Response: `{schemaVersion:2,result,replayed,claimId?:UUID|null,expiresAt?:number|null,remote?:ClaimRemote|null}`; results `claimed`, `unknown-id`, `state-conflict`, `operation-conflict`.

```ts
type ClaimRemote = Pick<RemoteRequest,
 "id"|"stateVersion"|"remoteVersion"|"status"|"localReference"|"importedAt"|"claimId">;
```

A new claim is permitted only for a submitted/unimported request at the expected revision, without a current active claim. Expired uncommitted claims may be replaced. Claim expiry is five minutes. Success increments `stateVersion`; use the returned revision, not the pull revision, for renewal/commit. Competing claims have one winner. Claim failure returns null claim fields; operation conflict omits them.

### POST `/requests/claims/renew`

Input: claim input plus `{claimId:UUID}`. A fresh operation UUID is required for each intended renewal.

Response has the same claim/remote fields, with result `renewed`, `state-conflict`, or `operation-conflict`. Renewal requires current ownership, matching revision, submitted/unimported state and uncommitted claim. An expired claim can be renewed by its original owner only if no replacement/cancellation has occurred. It extends the lease five minutes without advancing the request revision. Replaying an old renewal does not extend the lease again.

### POST `/requests/claims/commit`

```ts
type Input = Operation & {
 id:UUID;claimId:UUID;expectedStateVersion:StateVersion;
 version:Version;localReference:string; // trimmed 1..100
 status:"pending";canCancel:false;
};
type Response = {
 schemaVersion:2;
 result:"committed"|"unknown-id"|"claim-expired"|"state-conflict"|"operation-conflict";
 replayed:boolean;
 remote?:RemoteRequest|null;
};
```

Commit requires a live owned claim, matching revision, submitted/unimported state and publication version newer than the existing one. It sets the official local reference, pending state, import timestamp, publication version, immutable import evidence and `canCancel:false` atomically. A retry of the exact committed claim/reference/version can prove committed even through a fresh operation UUID. The original receipt remains the best recovery mechanism for a lost response.

`claim-expired` is a failed attempt, not permission to create another local request. Renew or reconcile and then use a **new commit operation UUID**; replaying a failed commit returns the same failed receipt. An employee cancellation race produces either cancelled/unimported state or committed/pending state, never a mixture. If cancellation wins after a local pending request was created, reconcile it through reviewed existing desktop domain services and never reserve/debit stock for that unresolved import.

### POST `/requests/statuses`

```ts
type Input = Machine & {
 requests:Array<{ // 1..50
  operationId:UUID;id:UUID;version:Version;
  localReference:string; // trimmed 1..100, must match committed reference
  status:"pending"|"accepted"|"refused"|"cancelled"|"delivered";
  canCancel:false;
  cancellationResolved?:boolean; // default false; clears a legacy cancellation intent
 }>;
};
type Response = {
 schemaVersion:2;
 results:Array<{
  id:UUID;attemptedVersion:number;replayed:boolean;
  result:"acknowledged"|"equivalent"|"stale"|"version-conflict"|"unknown-id"|"import-required"|"state-conflict"|"operation-conflict";
  remote?:RemoteRequest|null;
 }>;
};
```

Requires a committed import and the same official reference. Allowed transitions: same state; pending → accepted/refused/cancelled; accepted → delivered/cancelled. Terminal states cannot reopen or switch to another terminal state. Pending cannot jump directly to delivered. A restored desktop cannot overwrite an existing terminal state merely by allocating a higher publication version. A same-state newer publication can acknowledge the operator's unchanged authoritative result.

### POST `/requests/dispositions`

```ts
type Input = Machine & {
 records:Array<{ // 1..50
  operationId:UUID;id:UUID;expectedStateVersion:StateVersion;
  outcome:"rejected-before-import";
  reason:"employee-unavailable"|"product-unavailable"|"quantity-precision"|"invalid-items"|"unsupported-record";
 }>;
};
type Response = {
 schemaVersion:2;
 results:Array<{id:UUID;result:"acknowledged"|"equivalent"|"unknown-id"|"state-conflict"|"operation-conflict";replayed:boolean;remote?:RemoteRequest|null}>;
};
```

Dispositions refuse an unimported submitted request at the expected revision and remove it from pull. They preserve its items/note and set `dispositionReason`, without an official local reference. No claim or a claim belonging to the same machine is allowed. Do not dispose an imported request or manufacture a local official request for invalid data. A repeat of the same refusal reason can return equivalent.

### POST `/reconciliation/start`

Input: `Operation`.

Response: `{schemaVersion:2,result:"snapshot",replayed,sessionId,expiresAt,highWater,recordCount}` or operation-conflict with receipt fields only. Snapshot ownership is bound to machineId; expiry is thirty minutes. Employee records, **all request history**, items, mappings, claim evidence and catalogue version are captured in the same atomic D1 batch as the receipt. Replaying start returns the same session, even if expired; use a new operation to request a new snapshot.

`highWater` is the maximum known employee publication version, request publication version, catalogue version and staged catalogue version. It excludes portal state revisions and timestamps. It is a conservative publication floor, not a wall clock or stock snapshot. Even an uncommitted stage can raise it.

### POST `/reconciliation/page`

Input: `Machine & { sessionId:UUID; after?:string|null; limit?:number }`. Defaults after null/limit50; limit1..50; cursor string maximum100 characters.

Response:

```ts
{
 schemaVersion:2;sessionId:UUID;highWater:number;snapshotAt:number;
 records:ReconciliationRecord[];
 nextCursor:string|null;complete:boolean;
}
// Invalid, expired or differently owned session:
{schemaVersion:2,error:"session-expired-or-unknown"}
```

Records are ordered by stable keys `catalogue`, `employee:<UUID>`, `request:<UUID>`. Continue with nextCursor until complete. The record object does not carry its key; the page cursor does. This session is immutable while live records change. Its response errors use HTTP 200; the desktop must inspect `error` before processing the body.

### POST `/reconciliation/lookup`

Input: `Machine & {sessionId:UUID;employeeIds?:UUID[];requestIds?:UUID[];catalogue?:boolean}`. Each ID list maximum50 and defaults empty; catalogue defaults false. Either list may be empty.

Response has sessionId/highWater/snapshotAt/records/complete:true as above, **without nextCursor**. Records follow employeeIds input order, requestIds input order, then catalogue if requested. Unknown keys return `{kind:"missing",key:"employee:<id>"|"request:<id>"|"catalogue"}` explicitly. Empty selection returns an empty records array. Same session error as page.

```ts
type ReconciliationRecord =
 | {kind:"employee";id:UUID;version:number;name:string;email:string;enabled:boolean;emailRevision:number;activated:boolean}
 | (RemoteRequest & {
    kind:"request";localEmployeeId:UUID|null;note:string;createdAt:number;
    claim:{id:UUID;machineId:UUID;operationId:UUID;expiresAt:number;committedAt:number|null}|null;
    items:Array<{productId:UUID;quantity:number;label:string;unit:string}>;
   })
 | {kind:"catalogue";version:number}
 | {kind:"missing";key:string}; // lookup only
```

Catalogue reconciliation supplies version evidence, not product/stock reconstruction or a digest. Lookup/page do not release a stock fence or mutate portal state. There is deliberately no server endpoint that declares desktop stock reconciled.

### POST `/catalogue/snapshots/start`

Input: `Operation & {snapshotId:UUID;version:Version;expectedProducts:number;expectedChunks:number;sha256:string}`. Product count0..10000; chunks1..100; lowercase SHA-256 hex64. Snapshot UUID is allocated/persisted by the desktop.

Response: `{schemaVersion:2,result:"staged"|"snapshot-conflict"|"operation-conflict",replayed,snapshotId?,expiresAt?}`. Snapshot parameters are immutable. Equivalent parameters can return staged for the same snapshot, but inspect expiry; staged is not publication success. Expires after one hour.

### POST `/catalogue/snapshots/chunk`

Input: `Operation & {snapshotId:UUID;chunkIndex:number;products:Product[]}`. Index0..99 and below expectedChunks; products0..500. Each request must also fit the 256 KiB body limit. Chunks can arrive out of order and remain private until promotion. Index content is immutable; changed content requires a new stage, not overwriting a chunk.

Response: `{schemaVersion:2,result:"stored"|"snapshot-conflict"|"operation-conflict",replayed,snapshotId?,chunkIndex?}`. Stored proves those bytes have been stored, possibly by a previous attempt; it does not prove the stage is still live or committed. Expired, unknown, wrong-owner, committed or invalid-index fresh inserts cannot write a chunk. Previously identical stored chunks can still return stored, with final commit enforcing stage validity.

### POST `/catalogue/snapshots/commit`

Input: `Operation & {snapshotId:UUID}`.

Transactional response: `{schemaVersion:2,result:"committed"|"equivalent"|"stale"|"snapshot-expired"|"version-conflict"|"operation-conflict",replayed,snapshotId?,attemptedVersion?,remoteVersion?}`.

Pre-transaction validation response: `{schemaVersion:2,result:"unknown-id"|"incomplete-snapshot"|"invalid-snapshot"|"snapshot-too-large"|"digest-conflict"}`, without replayed. Missing/non-contiguous chunks → incomplete; wrong aggregate count or duplicate product UUIDs → invalid. Digest mismatch cannot promote. Missing chunks can be supplied before retrying the same commit operation since no receipt was created for that pre-validation failure.

Digest algorithm: normalize products as their schema specifies; sort all products by UUID ascending; recursively sort object keys ascending; serialize compact JSON without whitespace; hash its UTF-8 bytes using SHA-256, lowercase hex. Product keys are `available,id,label,unit` in canonical order. Use ordinary JSON strings, preserving Unicode; do not use ASCII-only escape settings that alter the canonical bytes. UUID/key strings are ASCII, so their ordering is stable across languages. Arrays retain order except the explicitly UUID-sorted top-level product array. Full canonical payload maximum1MiB. Example canonical product array:

```json
[{"available":true,"id":"123e4567-e89b-42d3-a456-426614174000","label":"Papier","unit":"Boîte"}]
```

Promotion validates all chunks then uses D1 `json_each` in one atomic batch to make absent products unavailable, upsert the full snapshot and update catalogue publication evidence. Readers see either the old complete catalogue or the new one. If a higher version wins concurrently, stale is not success for the lower snapshot. Do not clear a newer locally pending snapshot because an older commit receipt replays successfully.

### POST `/employees/lifecycle`

Input: `Machine & {employeeIds:UUID[]}`, 1..50.

```ts
type Response = {schemaVersion:2;employees:Array<
 {localEmployeeId:UUID;enabled:boolean;activated:boolean;emailRevision:number;
  remoteVersion:number;invitationState:"none"|"queued"|"sending"|"sent"|"failed";
  invitedAt:number|null;emailChangeState:"verified"|"verification-required"}
 | {localEmployeeId:UUID;result:"unknown-id"}
>};
```

`invitedAt` is the reserved invitation-attempt timestamp, not proof of delivery. Employee invitationState is queued during in-flight delivery; the attempt table separately records sending. `sent` means the email provider accepted the API request, not inbox delivery. `activated:true` proves the current email revision completed activation or was grandfathered at migration. `enabled:false` still denies access even if activated.

### POST `/employees/invitations`

Input: `Operation & {localEmployeeId:UUID;action:"resend-invitation"}`.

Response: `{schemaVersion:2,result:"queued"|"cooldown"|"unknown-id"|"disabled"|"already-activated"|"operation-conflict",replayed,retryAfterSeconds?:number|null,employees:LifecycleEntry[]}`. Lifecycle entries are the same as the lifecycle endpoint. Queued is the durable intent result; appended lifecycle indicates the current attempt outcome. Delivery is attempted before normal response completion.

Cooldown60 seconds. One durable queued→sending claim prevents concurrent same-operation duplicate delivery. Provider calls use `Idempotency-Key:<attemptId>` and a ten-second timeout. Replaying a sent/failed/sending operation does not send it again. To intentionally retry a failed or uncertain attempt after cooldown, use a new operation UUID. Replaying queued work can resume delivery if it never reached sending. A process crash after sending began leaves an uncertain attempt; show it as pending/uncertain, query lifecycle, and use a new deliberate resend after cooldown. The API does not claim exactly-once inbox delivery or expose recipient secrets.

## 5. Account lifecycle and employee validation

Better Auth still issues reset tokens, provides password hashing and manages sessions/login. Initial provisioning creates a user without an active portal account; activation requires choosing a password through the email link. Session creation and protected tRPC procedures check enabled status and matching email/activated revisions. Auth URLs are excluded from the generic server request logger because Better Auth email links may carry a reset token in the URL path.

Email changes revoke sessions, verification records and revision-bound token records atomically. Password-link redemption checks current email, enabled state, revision, verification expiry and binding expiry in the same batch that writes the official Better Auth credential, marks activation, verifies email, revokes sessions and consumes the token. A concurrent email change during password hashing cannot activate the old recipient. A reset token is single-use even under competing redemptions.

The employee endpoint `POST /api/auth/reset-password` is **not** a machine endpoint. It requires `Origin` exactly equal to configured `CORS_ORIGIN`, application/json and strict `{token:string(1..200),newPassword:string(8..128)}`. Body maximum4096 bytes; ten validated attempts per client IP per minute, stored atomically in D1 (Cloudflare `CF-Connecting-IP`; local fallback shared bucket). Success200 `{status:true}`; errors403 INVALID_ORIGIN,415 UNSUPPORTED_MEDIA_TYPE,400 INVALID_PASSWORD_INPUT/INVALID_TOKEN,413 BODY_TOO_LARGE,429 TOO_MANY_REQUESTS. Malformed JSON returns400 `{error:"Invalid JSON"}`. Direct invocation of Better Auth's ordinary reset API is blocked with PORTAL_RESET_REQUIRED so it cannot bypass these checks. Forgot-password/initial-link issuance continues through Better Auth's request-password-reset mechanism, with existing rate limits and trusted origins. Real mail requires RESEND_API_KEY and RESEND_FROM.

Employee submissions through existing tRPC use 1..30 unique product IDs, trimmed note maximum500, finite quantity >0 and <=10000 **ordinary units**, exactly representable in milliunits. The server and mobile/desktop portal UI validate three decimal places without rounding (`quantity === Math.round(quantity*1000)/1000`). Desktop must validate using its existing QUANTITY_SCALE=1000 conversion and domain constraints. Do not reinterpret ordinary units as already-scaled quantities. Legacy submissions with unsupported precision must be explicitly rejected/reconciled, not rounded. Product unit maximum80 is now aligned in v1, v2 and the portal.

## 6. HTTP and domain error handling

Machine middleware errors (JSON `{error:...}`):

| HTTP | Error | Required action |
| --- | --- | --- |
| 503 | sync-not-configured | Fix Worker secret configuration; keep fence. |
| 401 | invalid-timestamp-or-nonce | Check clock and UUID header; regenerate transport headers. |
| 401 | invalid-signature | Check secret, pathname and exact body bytes. Never retry indefinitely with a bad secret. |
| 409 | replayed-nonce | Fresh transport nonce/signature; retain operation UUID. |
| 413 | Body limit | Existing Hono production middleware returns text `Payload Too Large`; reduce batch/chunk size. |
| 415 | unsupported-media-type | V2 JSON `{schemaVersion:2,error:...}`; use application/json. |
| 400 | invalid-json / invalid-contract | V2 JSON errors; correct strict payload, not an unchanged blind retry. |
| 500 | Service unavailable | Main app JSON `{error:"Service unavailable"}`; outcome can be ambiguous. Retry exact operations and reconcile. |

Record/domain outcomes listed in section4 use HTTP200. They are not exceptions and must be checked individually. Reconciliation session-expired-or-unknown also uses200. Never interpret status200 alone as publication/import success. Unsupported routes use normal Hono404. No automatically exposed stack traces, tokens or D1 SQL errors are returned by the main app.

## 7. Additive portal migrations

Keep all existing migration directories and apply these after the two earlier portal migrations, in chronological order, through the project's Drizzle/D1 migration path. They have been tested on a legacy-data fixture. No existing employee, official request, item, quantity, stock or catalogue record is dropped.

1. `packages/db/src/migrations/20261014120525_aromatic_korath/migration.sql`
   - Creates exchange_operations (globally unique operation receipt), request_claims (request FK, unique operation_id, request index), reconciliation_sessions and reconciliation_records (composite PK, cascading session deletion), catalogue_stages and catalogue_chunks (composite PK, cascading stage deletion), portal_password_tokens, invitation_attempts.
   - Adds cloud_requests publication_version=0, publication_fingerprint, claim_id, imported_at, disposition_reason.
   - Adds employee_accounts email_revision=1, activated_revision=0, invitation_state='none'.
2. `packages/db/src/migrations/20261014121522_reflective_zodiak/migration.sql`
   - Adds employee_accounts publication_fingerprint and sync_state fingerprint.
   - Backfills request publication_version from the old state_version; imported_at from updated_at where an official local reference exists; enables cancellation only on submitted/unreferenced records.
   - Grandfathers existing credential holders by matching activated_revision to email_revision. Does not overwrite existing password hashes.
   - Backfills invitation_state from existing invited_at.
   - Intentionally invalidates old unbound reset-password verification links. Employees need a fresh link; these old links cannot establish the new ownership checks. Other business data is retained.

Generated Drizzle snapshots are included. Old fingerprints remain unknown/null until a new publication supplies them: desktop must send a newer reviewed version or reconcile rather than infer same-version equivalence from absence. Migration backfill is a one-time upgrade, not a repair script to rerun over already-upgraded state. Back up D1 before a future production migration and never edit applied migration history. These migrations have only been applied to disposable test databases during this implementation.

Operation receipts and evidence are intentionally retained; there is no scheduled retention/deletion task. Expired snapshot/stage content cannot be used for new mutations, but continues occupying storage. Define monitored retention before large sustained production use; preserve operation receipts for the entire desktop retry/restore horizon. Do not prune receipts as a quick fix for an ambiguous request. Historical claim rows also provide import evidence.

## 8. Required desktop implementation, in order

### A. Precise outbox and response parsers

Persist machine ID, operation UUID, normalized serialized payload, attempted publication version and job state before transmission. Make unchanged retransmissions reuse these values. Parse every result and returned identity; acknowledge only the exact matching outbox row. An old success cannot clear a newer pending revision. Split batches at50 and under256KiB. Preserve the current coordinator/generation guard so late replies from a restored database generation cannot mutate the new SQLite connection. Keep the stock fence on ambiguous/unknown/conflicting outcomes.

Capabilities must pass before v2 jobs are enabled. Add all new response discriminants; do not coerce unknown values into acknowledged. Prefer strict schema-version/type validation with forward-compatible response field handling. Existing signed machine auth code remains usable when it signs the new exact path/body.

### B. Claimed import with durable recovery

1. Pull, validate local employee/products/quantity precision, and record the remote request UUID. Unsupported data must not repeatedly block the first page.
2. Persist and acquire a claim using pull stateVersion. Record claimId, lease expiry and returned stateVersion. If another owner or cancellation won, reconcile instead of importing.
3. Under OperationCoordinator/generation guards and an existing SQLite transaction, reuse `source_external_id` unique request identity and existing domain creation services to create/find a local **pending** official request. Persist its mapping/reference and a durable commit operation in the same local transaction. Creating pending must not reserve/debit stock. Do not hold a SQLite transaction open across network requests.
4. Commit the claim to D1 with exactly that reference and the returned claim revision. Until committed evidence is verified, block acceptance/delivery/stock-changing cancellation for that request.
5. A lost response retries the original commit operation. Lease-expired failure requires renewal/reconciliation and a new commit operation. A takeover or employee cancellation is a domain conflict, not permission to silently duplicate, invent a reference or force a status publication.
6. Once import is verified, use existing desktop domain services for acceptance/rejection/cancellation/delivery, followed by a v2 status outbox publication. Commit never authorizes stock twice.

Persist claim/import phases so a process restart, network timeout or backup restore cannot forget the uncertain local import. Dispositions are only for pre-import validation failures, with current expected stateVersion and reason. Do not use disposition to erase an official imported request. Reuse existing `findRequestByExternalId` and unique `source_external_id` protection.

### C. Restore reconciliation

Restore/reconnection starts fenced, suppressing publication of stale SQLite state and all unresolved portal-related stock mutations. Increment/check database generation as the current desktop code already does. Create a fresh reconciliation session; persist its identity and paginate to completion before deciding the reconciliation result. Compare mappings, exact local reference, status, items, outstanding operations and claim evidence against local data. Explicit missing records are evidence of absence in that snapshot, not a deletion instruction.

Advance the durable publication allocator to at least `max(localFloor, snapshot.highWater)+1`, respecting the safe-integer limit. Protect the allocator and machine identity from rollback where possible; reconcile on every restore even when that external state survives. Do not reuse old versions or mutate recorded operation payloads. Handle counter exhaustion as a blocking operator condition.

An old backup may contain PENDING while the portal shows DELIVERED. Do **not** send a higher PENDING version, reopen the portal record, recreate a delivery, or reapply stock/reservations. The snapshot does not carry authoritative stock ledgers or signed PDFs. Restore/recover those through the existing desktop backup/domain process and verify them before releasing the fence. Where the backup lost a local mapping but the portal retained an official reference, find the real local/domain evidence; do not reconstruct a new official request just from cloud items. Ambiguities remain fenced for operator review.

Snapshot completion proves only that all snapshot records were read. The portal has no endpoint to certify desktop reconciliation complete. Desktop decides fence release from verified domain evidence. Revalidate affected live records with a fresh snapshot/claim when proceeding after a long reconciliation; ordinary conditional mutations still enforce revisions and prevent stale writes.

### D. Catalogue and quantity alignment

Support units up to80 and existing exact milliunit conversions. Publish small snapshots atomically through /catalogue. For larger catalogues persist stage manifest/hash, immutable chunks and commit operation; upload complete contiguous chunks and promote. Split by actual UTF-8 bytes as well as product count. Retry unacknowledged chunks; do not expose partial snapshots. Handle aggregate1MiB/10,000-product limits explicitly in the desktop UI. Compute the canonical digest exactly, including Arabic/French UTF-8.

### E. Secure employee account lifecycle

Use lifecycle endpoint instead of inferring activation/delivery from publication success. Display enabled/activation/email-change-required/invitation states separately. Operator resend uses the exact action endpoint and cooldown, with a newly persisted operation for an intentional resend. Do not read/copy portal passwords or reset links into SQLite, logs or IPC/UI. Email edits require activation at the new address; old sessions are revoked. Account failures must be visible without blocking unrelated healthy publications.

No new desktop stock rules are required: map existing PENDING→pending, REJECTED→refused, ACCEPTED→accepted, CANCELLED_BEFORE_DELIVERY→cancelled, DELIVERED_SIGNED→delivered. Do not publish a direct pending→delivered jump: preserve the accepted publication transition or reconcile the already-finalized history.

## 9. Required desktop proof and report

After implementing, provide exact desktop migrations and changed modules; finalized endpoint schemas; safe outbox-clearing rules; lease/restart/import recovery; backup-generation guards; fence release criteria; lifecycle states and resend behavior; tests and their commands/results; unresolved conflicts; whether any real cloud/email service was touched. Include a versioned payload/response fixture set that matches this handoff.

Desktop tests must cover competing import loops; retry after local creation before cloud commit; lost cloud-commit response; employee cancellation during claim/local import/commit; lease expiration/takeover; double submission/import and unique external IDs; staged catalogue interruption/digest/duplicate/missing chunks; stale/same-version conflicting acknowledgements; terminal restore history; missing local mappings; restore during in-flight HTTP and late reply; email changes/session/link revocation; rate/cooldown behavior. Prove stock reservation/debit/delivery occurs once through actual existing domain services. Portal tests cannot prove desktop stock correctness.

## 10. Portal validation and remaining release blockers

- `bun run test:exchange`: 43 passing integration tests, 326 assertions, isolated workerd D1; real atomic batches and concurrency, migration backfill, signed Hono requests, cancellation races, operation receipts, snapshot consistency, staging, duplicates, password/link/email races, invitation replays across email changes and rate limits.
- `bun run test:portal:isolated`: disposable assembled Worker HTTP smoke with synthetic secrets. Covers Better Auth activation/login, tRPC submission/ownership/idempotency/search/pagination, v1 compatibility, v2 capabilities/claims/commit/replay/status, reconciliation and email-session revocation. No production D1 or actual email provider calls. The runner uses temporary configuration/database and removes it afterward.
- `bun run check-types`: all seven packages with typecheck tasks pass.
- Focused Biome checks cover changed implementation, schema, tests and scripts and pass. Repository-wide `bunx biome check .` was also run read-only and reports 169 errors/87 warnings/13 informational diagnostics across generated files, UI, skill files and other files beyond the focused implementation checks. Those files were not mass-rewritten.
- `bun run build`: server tsdown and Next.js production builds pass.
- Hono CLI route inspection and capabilities request pass.
- `bun run build:cloudflare` remains blocked on this Windows host: OpenNext reports Windows incompatibility and raises EPERM preparing `apps/web/.open-next`. Verify the adapter build under WSL/Linux before any release. A successful Next.js build is not proof of OpenNext packaging.

Remaining integration/release work: desktop v2 implementation and domain-stock tests; coordinated cross-project end-to-end tests using its finalized parser; OpenNext packaging under WSL/Linux; controlled real-email delivery check with configured sender; production capacity/retention monitoring; deliberate future migration/deployment authorization. None of these is represented as already completed. No production deployment, production migration, or desktop repository modification was performed in this task.
