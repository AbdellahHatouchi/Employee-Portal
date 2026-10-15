# Production deployment

Production website: https://cfs-empoyee-portial.abdellahhatouchi.workers.dev
Production API: https://cfs-empoyee-portial-api.abdellahhatouchi.workers.dev

These exact Worker names preserve the spelling requested by the owner. Production uses a separate empty D1 database, `cfs-empoyee-portial-production` (`5cfb10b4-6c4d-436d-ae0e-f101980daac9`). Staging remains on its original Workers/database. No staging employees, accounts, sessions or requests are migrated.

Run the manual **Employee Portal - Production deployment** GitHub Actions workflow on master. It installs locked dependencies, applies the existing compatible Next.js build pin, runs focused authorization/invitation tests, builds the web Worker, verifies its API rewrites, prepares the four existing tracked SQL migrations for Wrangler's migration runner, applies only unapplied production migrations, and deploys the API then website. The API secrets are supplied with the deployment via a restricted temporary file removed in an always-run cleanup step. The website self-reference binding targets its own production Worker.

GitHub environment `production` supplies BETTER_AUTH_SECRET, SYNC_SECRET and RESEND_API_KEY. Production has a new auth secret; the sync key matches the designated desktop's existing protected credential. The owner explicitly approved these encrypted GitHub environment secrets. Existing staging secrets were not changed. Repository Cloudflare deployment credentials are reused. No credentials belong in this document or Git.

Both deployment workflows run a post-deploy smoke check: login must load, private pages with a harmless locale cookie must redirect to login, and the protected data API must reject anonymous access. This specifically exercises the previously failing server-side guard branch.

## Private-page error fixed

The live staging Worker logged `TypeError: Invalid redirect value` when the server guard called fetch with `redirect: error`. Cloudflare's edge fetch accepts `follow` and `manual`, so a cookie-bearing visit failed before it could check the API session. The login page did not call that guard. The fix uses `manual`, rejects all 3xx API responses explicitly, and retains non-cached session/employee checks. Access is not granted based on cookie presence. Regression tests also cover unexpected 302/307 responses.

Validation before deployment: 12 focused access/invitation tests passed, 44 assertions; web type checking passed; workflow/config isolation checks passed; production API dry-run bundle passed. A failed/blocked deployment must not be described as successful. Actual deployment identities and live smoke results are recorded separately after execution.

## Desktop connection boundary

The operational desktop remains configured for staging and its automatic sync remains disabled. Creating production Workers does not change local SQLite, publish all employees, issue invitations or migrate request mappings. Because production is empty and existing desktop receipts refer to staging, endpoint switching and first publication require the existing reconciliation/scope protections. Do not copy cloud test records or force local receipt/stock changes to populate production. No full stock/import/delivery/offline production-readiness claim is made from this deployment task.
