# Portal access review — 15 October 2026

Every private entry page (home, dashboard, profile, request history, new request and request details) now awaits a server-side authorization check before rendering. Anonymous, invalid-session, disabled and unactivated accounts are sent to login. API/network failures and malformed success responses fail closed. Login, activation and password recovery remain public.

The guard forwards the incoming cookies only to the configured API origin and calls the existing protected procedure. Responses use no-store and redirects are refused. No session presence-only authorization, client-supplied identity, new auth system or shared user cache was introduced. Existing client session gates remain useful after session expiry/logout.

API review: catalogue and request procedures already require a valid session plus an enabled employee with the current activated email revision. List/detail/cancel request queries constrain ownership to the authenticated user. Request creation derives the employee identity from the session. These protections were preserved.

Validation: seven focused authorization tests passed (23 assertions), including missing/expired/forbidden access, fail-closed malformed/error responses, forwarded-cookie/cache policy, coverage of private entry pages, anonymous API rejection and enabled/activation checks. Web type checking and scoped Biome checks passed.

No portal production build, local Worker/D1 server, deployment, live stock mutation or full end-to-end login test was run for this update. Commit/push does not establish that the changes are deployed. Existing controlled desktop/portal acceptance remains incomplete until its stock and retry phases are performed.
