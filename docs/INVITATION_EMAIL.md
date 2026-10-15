# Portal invitation email

The shared invitation/password-reset sender renders `packages/auth/src/portal-access-email.tsx` with React Email 6.11.2. It sends inline-styled HTML and an explicit bilingual plain-text alternative. No external logo, image, font, stylesheet or tracking URL is required.

The template uses neutral colors, a French heading, a right-to-left Arabic section, one bilingual password button, a 30-minute expiry notice and a copyable fallback link. The same design handles initial account access and password recovery without claiming that a new account was registered.

`email-template.ts` preserves the URL supplied by Better Auth. The provider sender retains its existing subject, timeout, idempotency key and positive receipt check. No activation/session/stock/database behavior changed.

Validation: five invitation tests passed (19 assertions), including original-link integrity in HTML/plain text and failure receipt handling. Auth package, API package and Worker types passed. Cloudflare dry-run bundling passed, with approximately 787 KiB gzip output. Browser preview reviewed; narrow-screen layout measurement showed no horizontal overflow. This is not a Gmail/Outlook rendering certification or a live email delivery test. No invitation was sent and no deployment was performed.

To preview safely, call `renderPasswordEmail` with a synthetic `https://example.test/...` URL and open the resulting HTML. Never save real activation links in preview fixtures or source control.
