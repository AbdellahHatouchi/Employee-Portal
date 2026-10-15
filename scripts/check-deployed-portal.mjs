import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const origin = new URL(process.env.PORTAL_WEB_URL);
assert.equal(origin.protocol, "https:");
// A just-created workers.dev hostname and edge deployment can take a short time to settle.
// Retry transient 404/5xx/transport failures; an unauthorized private page returning 200 fails immediately.
async function ready(path, expected, headers) {
	let last;
	for (let attempt = 1; attempt <= 6; attempt++) {
		try {
			const response = await fetch(new URL(path, origin), {
				headers,
				redirect: "manual",
				signal: AbortSignal.timeout(15000),
			});
			if (expected.includes(response.status)) return response;
			last = `HTTP ${response.status}`;
			if (response.status !== 404 && response.status < 500)
				throw new Error(`Unexpected access response for ${path}: ${last}`);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Unexpected access response")
			)
				throw error;
			last = error instanceof Error ? error.name : "transport error";
		}
		console.log(
			`Waiting for deployment: ${path}, attempt ${attempt}/6, ${last}`,
		);
		if (attempt < 6) await delay(5000);
	}
	throw new Error(`Deployment did not become ready: ${path}, ${last}`);
}
for (const path of ["/login", "/dashboard", "/requests", "/profile"]) {
	const response = await ready(path, path === "/login" ? [200] : [303, 307], {
		Cookie: "portal-locale=fr",
	});
	if (path !== "/login")
		assert.equal(
			new URL(response.headers.get("location"), origin).pathname,
			"/login",
		);
	console.log(`PASS ${path}: ${response.status}`);
}
const api = await ready("/trpc/privateData", [401]);
assert.equal(api.status, 401, "Protected API must reject anonymous calls");
console.log("PASS anonymous API access denied");
