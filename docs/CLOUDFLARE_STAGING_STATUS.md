# Cloudflare staging preparation — blocked before deployment

14 October 2026. No production resources or data were changed. No Alchemy deployment, GitHub push, paid-resource creation, D1 creation, remote migration, secret upload, or Worker deployment was performed.

## Targets prepared locally

Account ID: `58691d5dbfbbdcce24303f1c3b7ee16b`.
Workers subdomain: `abdellahhatouchi`.
Read-only Cloudflare inventory found no existing Workers or D1 databases in this account at the time of inspection.

| Item | Status |
| --- | --- |
| Planned web URL | `https://store-managment-communal-web-web-staging.abdellahhatouchi.workers.dev` — not deployed |
| Planned API URL | `https://store-managment-communal-web-api-staging.abdellahhatouchi.workers.dev` — not deployed |
| Planned D1 name | `store-managment-communal-web-staging` — not created |
| Server configuration | `apps/server/wrangler.staging.jsonc` |
| Web configuration | `apps/web/wrangler.staging.jsonc` |
| Staging secrets | Separate auth/machine secrets and supplied Resend credential are in ignored `apps/server/.dev.vars.staging`; access restricted to current user and SYSTEM; nothing uploaded |
| Sender | Supplied RESEND_FROM read from local server .env and configured for staging; sender/provider validity was not tested |
| Migration status | Four files preserved unchanged; none applied remotely |

The API config still contains the **dummy preflight D1 UUID** `00000000-0000-0000-0000-000000000001`. Never deploy or migrate remotely with that UUID. Replace it only with the ID of the newly created staging database when a complete deployable web build is available.

## Build attempts and focused fixes

1. Moved the old generated `.open-next` output to ignored workspace `tmp` after validating both paths. This cleared the previous output cleanup EPERM. Existing source/dependencies were untouched.
2. Ran OpenNext on Windows/PowerShell with the staging API URL exported. Next.js production compilation, TypeScript and page generation succeeded. Verified the generated auth and tRPC rewrites point to the staging API URL.
3. OpenNext failed creating a directory symlink during server bundle generation (`copyTracedFiles.js`).
4. Added a small build-only preload, `scripts/opennext-windows-junctions.mjs`. It falls back to a Windows junction only on EPERM for directory links from `.next/standalone` into `.open-next`. It does not patch dependencies, alter application runtime or operate outside those generated paths.
5. Reused the successfully generated Next.js output with `--skipNextBuild`. Junction fallback passed the symlink stage and OpenNext reached its final server bundler.
6. Bundle still failed on Sharp0.35.5: unresolved `../src/build/Release/sharp-*-*.node` / `sharp-wasm32-*.node` requires, and no loader for the native `@img/sharp-win32-x64` .node binary. A Cloudflare web artifact was **not** produced successfully. Do not deploy the partial `.open-next` output.

The API passed Wrangler deploy **dry-run**: compressed bundle approximately520KiB; correct staging DB/auth/origin bindings. This was local compilation only; no upload. API deployment was withheld because the user requires successful builds before staging deployment.

Installed environment: Windows11, Node25.2.1, Next16.4.0, OpenNext Cloudflare1.20.11, Wrangler4.151.0. No dependency versions, lockfile, migration SQL, existing Alchemy configuration or production Wrangler configuration were changed.

## Simplest next step

Use a supported Linux/macOS machine for this same complete reviewed working tree, build with a supported Node LTS and fresh platform-specific dependencies, and then deploy the resulting artifacts with the explicit staging configurations. No WSL, CI, virtual machine or cloud build service was created or configured automatically. A Windows-only continuation would need a focused review of OpenNext/Sharp compatibility; enabling Developer Mode alone addresses symlink privilege, not the current native Sharp bundling failure. Changing package versions or adding a loader that merely copies native binaries into a Worker is not a safe assumed fix.

The Linux/macOS route still needs a successful OpenNext build: the Sharp errors may also involve adapter/package compatibility, so success on another OS is not guaranteed. Preserve the application architecture and do not deploy until bundling succeeds. See `CLOUDFLARE_STAGING_REVIEW.md` for the approved target setup sequence; substitute these detected public identifiers and keep the existing staging machine secret rather than generating it again.

## Reproduction on Windows

From `apps/web`, after safely moving failed generated output aside:

```powershell
$env:NEXT_PUBLIC_SERVER_URL = 'https://store-managment-communal-web-api-staging.abdellahhatouchi.workers.dev'
node --import ../../scripts/opennext-windows-junctions.mjs node_modules/@opennextjs/cloudflare/dist/cli/index.js build --config wrangler.staging.jsonc --env staging --skipNextBuild
```

SkipNextBuild is valid only for the matching successful staging Next.js build; do not use it after source/URL changes. A fresh attempt uses build without that flag. Do not repeat remote commands or full test suites while the build remains blocked.

## Desktop V2 connection information

- API base URL will be the API Worker origin above, once deployed; it is **not yet usable**.
- Schema version2; transport signing versionv1; endpoints `/api/sync/v2/*`.
- Retrieve the existing SYNC_SECRET locally through an approved secure mechanism from `apps/server/.dev.vars.staging`; do not paste it into chat/logs or put it in frontend code. Keep it stable across retries and future deployment.
- Configure a dedicated desktop test profile/SQLite with synthetic data and its own persistent machine UUID. Do not connect the operational SQLite database.
- Follow `PORTAL_DESKTOP_HANDOFF.md` for exact HMAC timestamp/nonce/body signing and claims/import/cancellation/reconciliation rules.

## Verification status

No deployed API health check, web login check, unauthorized capabilities check or remote migration verification can be performed yet because neither Worker nor staging D1 exists. Local API bundle validation and the staging Next.js build succeeded; final OpenNext packaging remains the blocker. No extensive E2E test or repeated full test suite was run.
