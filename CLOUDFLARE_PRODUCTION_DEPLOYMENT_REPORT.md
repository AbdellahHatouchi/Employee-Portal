# Cloudflare production deployment and private-page repair

15 October 2026. **Deployment/access verification: PASS.** Full stock-domain production acceptance remains outside this verification and incomplete.

## Verified failure and correction

The deployed staging login page returned 200, but `/dashboard` with only `Cookie: portal-locale=fr` returned 500. A sanitized live Worker trace identified `TypeError: Invalid redirect value`, explicitly rejecting `redirect: error` at the edge. The recently introduced server guard used this unsupported value. It now uses `redirect: manual` and explicitly rejects unexpected 3xx API responses. Session, enabled-account, activated-email-revision and no-store protections remain enforced. No authentication bypass was introduced.

## User-approved production isolation

Website: https://cfs-empoyee-portial.abdellahhatouchi.workers.dev
API: https://cfs-empoyee-portial-api.abdellahhatouchi.workers.dev

The exact requested spelling is preserved. These are new Workers created by the production GitHub Actions workflow. Database `cfs-empoyee-portial-production`, ID `5cfb10b4-6c4d-436d-ae0e-f101980daac9`, is separate from staging. The user explicitly selected an empty production database. It initially contained zero user tables; Actions applied the four existing SQL migrations using tracked Wrangler migration filenames. A second deployment left exactly four applied migrations, proving that the initialization is not blindly repeated.

Final production counts: users 0, employee accounts 0, requests 0, catalogue 0. No staging identities, sessions, catalogue or requests were copied. Existing staging accounts therefore do not exist in production yet.

## Credential provisioning

The user explicitly approved storing three encrypted secrets in the GitHub repository's production environment: a fresh BETTER_AUTH_SECRET, the designated desktop's existing DPAPI-protected SYNC_SECRET and the existing RESEND_API_KEY. GitHub's environment public key was used for sealed-box encryption. Values were not printed or committed. Production auth is isolated; staging secrets were not changed. The existing native credential adapter supplied the production sync key. The local staging provisioning file differed from that protected key, so it was not used to provision production.

The production workflow writes a mode-0600 temporary secrets file, supplies it with the API deployment, and removes it in an always-run cleanup step. No provider email was sent as part of setup.

## Source and workflows

Implementation commits: `94bda5c` (guard correction and production setup), `d98463e` (bounded edge readiness check). Deployed workflow source SHA: `d98463ee2a727a20a1c4d69b6d7db45676b11f8a`.

Changed files: `apps/web/src/lib/portal-access.ts`, `scripts/portal-access.test.ts`, both deployment workflows, `apps/server/wrangler.production.jsonc`, `apps/web/wrangler.production.jsonc`, `scripts/prepare-production-migrations.ts`, `scripts/check-deployed-portal.mjs`, `.gitignore` and deployment documentation.

The initial workflow deployments uploaded successfully but their immediate smoke steps failed. Subsequent exact smoke runs against the settled sites passed. The gate now retries transient 404/5xx/network errors at most six times with five-second pauses, then fails; an unauthorized private page returning 200 fails immediately. Unexpected redirect targets still fail. Both final workflows succeeded, including their post-deployment checks.

| Environment | Workflow result | Run |
| --- | --- | --- |
| staging-deploy.yml | success | [GitHub Actions](https://github.com/AbdellahHatouchi/Employee-Portal/actions/runs/38752632229) |
| production-deploy.yml | success | [GitHub Actions](https://github.com/AbdellahHatouchi/Employee-Portal/actions/runs/38752635769) |

## Active deployed versions

| Worker | Version | Traffic |
| --- | --- | --- |
| productionApi | `b7e018f9-a406-4acf-ac4e-e67af426e9ea` | 100% |
| productionWeb | `42440b87-3636-417c-b339-f8f053f684d2` | 100% |
| stagingApi | `8d7b576d-71df-4948-9cf7-3f5afba19420` | 100% |
| stagingWeb | `00f80b27-6c81-4fc7-b64a-6671ff7d0436` | 100% |

## Verification results

- PASS: 12 focused access/invitation tests, 44 assertions; web type checking; workflow syntax/isolation validation; API dry-run bundle.
- PASS: both final GitHub Actions workflows, including Linux/OpenNext build, route manifest verification and deployment smoke checks.
- PASS on both live sites: login 200; dashboard, requests and profile with only a locale cookie redirect to login; protected API returns 401 for anonymous calls.
- PASS: production browser navigation from dashboard reaches a rendered login form.
- PASS: packaged native signed V2 capabilities against production using the existing protected desktop credential. This consumed only authentication replay metadata, with no publication or local settings change.
- PASS: independent production D1 read-back confirms four applied migrations and zero business records after the repeated workflow.

## Limits and next operational boundary

No real production employee was provisioned or invited; authenticated production browser navigation cannot be verified until an authorized account exists. Full import/reservation/delivery/cancellation/offline/restore acceptance is not claimed. These infrastructure checks do not establish routine stock-processing readiness.

The operational desktop remains pointed at staging with automatic sync disabled. SQLite, stock, local requests and external mappings were not changed. A later endpoint switch and initial employee/catalogue publication must use the supported desktop configuration, reconciliation and scope mechanisms. Do not overwrite existing receipt state or silently migrate staging records into production.
