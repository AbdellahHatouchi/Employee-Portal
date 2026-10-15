import assert from "node:assert/strict";

const origin = new URL(process.env.PORTAL_WEB_URL);
assert.equal(origin.protocol, "https:");
for (const path of ["/login", "/dashboard", "/requests", "/profile"]) {
	const response = await fetch(new URL(path, origin), {
		headers: { Cookie: "portal-locale=fr" },
		redirect: "manual",
		signal: AbortSignal.timeout(20000),
	});
	if (path === "/login") assert.equal(response.status, 200, "Login must load");
	else {
		assert(
			[303, 307].includes(response.status),
			`Private route ${path} must redirect, received ${response.status}`,
		);
		assert.equal(
			new URL(response.headers.get("location"), origin).pathname,
			"/login",
		);
	}
	console.log(`PASS ${path}: ${response.status}`);
}
const api = await fetch(new URL("/trpc/privateData", origin), {
	redirect: "manual",
	signal: AbortSignal.timeout(20000),
});
assert.equal(api.status, 401, "Protected API must reject anonymous calls");
console.log("PASS anonymous API access denied");
