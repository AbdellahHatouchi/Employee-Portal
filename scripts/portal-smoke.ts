import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const origin = process.env.PORTAL_TEST_ORIGIN ?? "http://localhost:3000";
const webOrigin = "http://localhost:3001";
const secret =
	process.env.PORTAL_TEST_SECRET ??
	readFileSync("apps/server/.dev.vars", "utf8")
		.match(/^SYNC_SECRET=(.+)$/m)?.[1]
		?.trim();
assert(secret, "Local SYNC_SECRET must be configured.");
async function signed(path: string, value?: unknown, fixedNonce?: string) {
	const body = value === undefined ? "" : JSON.stringify(value);
	const method = value === undefined ? "GET" : "POST";
	const timestamp = String(Date.now());
	const nonce = fixedNonce ?? randomUUID();
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body),
	);
	const hex = Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
	const message = ["v1", method, path, timestamp, nonce, hex].join("\n");
	const signature = createHmac("sha256", secret as string)
		.update(message)
		.digest("hex");
	return fetch(origin + path, {
		method,
		headers: {
			"Content-Type": "application/json",
			"X-Sync-Timestamp": timestamp,
			"X-Sync-Nonce": nonce,
			"X-Sync-Signature": signature,
		},
		...(body ? { body } : {}),
	});
}
async function localSql(sql: string) {
	const child = Bun.spawn(
		[
			"node",
			resolve("apps/web/node_modules/wrangler/bin/wrangler.js"),
			"d1",
			"execute",
			"communal-portal-local",
			"--local",
			"--config",
			process.env.PORTAL_TEST_CONFIG ?? "apps/server/wrangler.local.jsonc",
			...(process.env.PORTAL_TEST_PERSIST
				? ["--persist-to", process.env.PORTAL_TEST_PERSIST]
				: []),
			"--command",
			sql,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const output = await new Response(child.stdout).text();
	assert.equal(await child.exited, 0, output);
}
async function rpc(
	path: string,
	input: unknown,
	cookie = "",
	mutation = false,
) {
	const response = await fetch(
		origin +
			"/trpc/" +
			path +
			(mutation ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`),
		{
			method: mutation ? "POST" : "GET",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookie,
				Origin: webOrigin,
			},
			...(mutation ? { body: JSON.stringify(input) } : {}),
		},
	);
	const value = (await response.json()) as {
		result?: {
			data: {
				id: string;
				products: { id: string }[];
				total: number;
				page: number;
				pageCount: number;
				status: string;
				cancelRequestedAt: number | null;
			};
		};
		error?: unknown;
	};
	return { response, data: value.result?.data, error: value.error };
}
async function employee(email: string, name: string) {
	const localEmployeeId = randomUUID();
	const result = await signed("/api/sync/employees", {
		schemaVersion: 1,
		employees: [
			{
				localEmployeeId,
				name,
				email,
				enabled: true,
				version: 1,
				invite: false,
			},
		],
	});
	assert.equal(result.status, 200);
	assert.equal(
		((await result.json()) as { results: { result: string }[] }).results[0]
			?.result,
		"acknowledged",
	);
	const token = randomUUID();
	await localSql(
		`INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) SELECT '${randomUUID()}', 'reset-password:${token}', user_id, ${Date.now() + 1800000}, ${Date.now()}, ${Date.now()} FROM employee_accounts WHERE local_employee_id = '${localEmployeeId}'`,
	);
	const password = "Local-test-password-2026!";
	await localSql(
		`INSERT INTO portal_password_tokens(identifier,user_id,email_revision,email,expires_at) SELECT 'reset-password:${token}',e.user_id,e.email_revision,u.email,${Date.now() + 1800000} FROM employee_accounts e JOIN user u ON u.id=e.user_id WHERE e.local_employee_id='${localEmployeeId}'`,
	);
	const reset = await fetch(`${origin}/api/auth/reset-password`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: webOrigin },
		body: JSON.stringify({ token, newPassword: password }),
	});
	assert.equal(reset.status, 200, await reset.text());
	const login = await fetch(`${origin}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: webOrigin },
		body: JSON.stringify({ email, password, rememberMe: true }),
	});
	assert.equal(login.status, 200, await login.text());
	const cookie = login.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
	assert(cookie);
	return { localEmployeeId, email, name, cookie };
}
const run = randomUUID().slice(0, 8);
const first = await employee(`portal-${run}@example.test`, "موظف تجريبي");
const other = await employee(`other-${run}@example.test`, "Autre employé");
const product = {
	id: randomUUID(),
	label: "ورق A4 / Papier A4",
	unit: "علبة / Boîte",
	available: true,
};
const second = {
	id: randomUUID(),
	label: "قلم أزرق / Stylo bleu",
	unit: "قطعة / Pièce",
	available: true,
};
const version = Date.now();
assert.equal(
	(
		await signed("/api/sync/catalogue", {
			schemaVersion: 1,
			version,
			products: [product, second],
		})
	).status,
	200,
);
const catalogue = await rpc("catalog.listAvailable", {}, first.cookie);
assert.equal(catalogue.data.products.length, 2);
assert(!JSON.stringify(catalogue.data).includes("stock"));
const input = {
	idempotencyKey: randomUUID(),
	note: "Local runtime verification",
	items: [
		{ productId: product.id, quantity: 2 },
		{ productId: second.id, quantity: 3 },
	],
};
const created = await rpc("requests.create", input, first.cookie, true);
assert.equal(created.response.status, 200, JSON.stringify(created));
const id = created.data.id;
assert.equal(
	(await rpc("requests.create", input, first.cookie, true)).data.id,
	id,
);
assert.equal(
	(
		await rpc(
			"requests.create",
			{ ...input, note: "Changed payload" },
			first.cookie,
			true,
		)
	).response.status,
	409,
);
assert.equal(
	(await rpc("requests.getMine", { id }, other.cookie)).response.status,
	404,
);
assert.equal((await rpc("requests.getMine", { id })).response.status, 401);
assert.equal(
	(
		await rpc(
			"requests.create",
			{
				...input,
				idempotencyKey: randomUUID(),
				items: [{ productId: product.id, quantity: 0 }],
			},
			first.cookie,
			true,
		)
	).response.status,
	400,
);
assert.equal(
	(
		await signed("/api/sync/requests/statuses", {
			schemaVersion: 1,
			requests: [
				{
					id,
					version: 1,
					localReference: "LOCAL-TEST-001",
					status: "pending",
					canCancel: true,
				},
			],
		})
	).status,
	200,
);
assert.equal(
	(await rpc("requests.cancelMine", { id }, first.cookie, true)).response
		.status,
	409,
);
let detail = await rpc("requests.getMine", { id }, first.cookie);
assert.equal(detail.data.status, "pending");
assert.equal(detail.data.cancelRequestedAt, null);
assert.equal(
	(
		await signed("/api/sync/requests/statuses", {
			schemaVersion: 1,
			requests: [
				{
					id,
					version: 2,
					localReference: "LOCAL-TEST-001",
					status: "cancelled",
					canCancel: false,
					cancellationResolved: true,
				},
			],
		})
	).status,
	200,
);
detail = await rpc("requests.getMine", { id }, first.cookie);
assert.equal(detail.data.status, "cancelled");
const unimported = await rpc(
	"requests.create",
	{ ...input, idempotencyKey: randomUUID() },
	first.cookie,
	true,
);
await rpc(
	"requests.cancelMine",
	{ id: unimported.data.id },
	first.cookie,
	true,
);
assert.equal(
	(await rpc("requests.getMine", { id: unimported.data.id }, first.cookie)).data
		.status,
	"cancelled",
);
const nonce = randomUUID();
assert.equal(
	(await signed("/api/sync/requests", undefined, nonce)).status,
	200,
);
assert.equal(
	(await signed("/api/sync/requests", undefined, nonce)).status,
	409,
);
assert.equal(
	(
		await fetch(`${origin}/api/sync/requests`, {
			headers: { Cookie: first.cookie },
		})
	).status,
	401,
);
await signed("/api/sync/catalogue", {
	schemaVersion: 1,
	version: version - 1,
	products: [],
});
assert.equal(
	(await rpc("catalog.listAvailable", {}, first.cookie)).data.products.length,
	2,
);
await signed("/api/sync/employees", {
	schemaVersion: 1,
	employees: [{ ...other, enabled: false, version: 2 }],
});
assert.equal(
	(await rpc("requests.listMine", { limit: 50 }, other.cookie)).response.status,
	401,
);
const extraProducts = Array.from({ length: 35 }, (_, index) => ({
	id: randomUUID(),
	label: `Article de test ${String(index + 1).padStart(2, "0")} / لوازم مكتبية`,
	unit: "Pièce / قطعة",
	available: true,
}));
const largeSnapshot = [
	product,
	second,
	...extraProducts,
	{
		id: randomUUID(),
		label: "Hidden unavailable product",
		unit: "Pièce",
		available: false,
	},
];
assert.equal(
	(
		await signed("/api/sync/catalogue", {
			schemaVersion: 1,
			version: version + 1,
			products: largeSnapshot,
		})
	).status,
	200,
);
const pageOne = (
	await rpc("catalog.listAvailable", { page: 1, pageSize: 12 }, first.cookie)
).data;
const pageTwo = (
	await rpc("catalog.listAvailable", { page: 2, pageSize: 12 }, first.cookie)
).data;
assert.equal(pageOne.total, 37);
assert.equal(pageOne.pageCount, 4);
assert.equal(pageOne.products.length, 12);
assert.equal(pageTwo.products.length, 12);
assert(
	!pageTwo.products.some((item) =>
		pageOne.products.some((otherItem) => otherItem.id === item.id),
	),
);
const searched = (
	await rpc(
		"catalog.listAvailable",
		{ search: "  Article de test 01  ", page: 99 },
		first.cookie,
	)
).data;
assert.equal(searched.total, 1);
assert.equal(searched.page, 1);
assert.equal(searched.products[0]?.id, extraProducts[0]?.id);
assert.equal(
	(await rpc("catalog.listAvailable", { search: "%_" }, first.cookie)).data
		.total,
	0,
);
assert.equal(
	(await rpc("catalog.listAvailable", { search: "' OR 1=1" }, first.cookie))
		.data.total,
	0,
);
assert.equal(
	(await rpc("catalog.listAvailable", { pageSize: 500 }, first.cookie)).response
		.status,
	400,
);
console.log(
	"PASS: Worker/D1 auth, request workflows, ownership, machine sync and server-side search/pagination (37 available products).",
);
console.log(
	`Local UI test account: ${first.email} (password: Local-test-password-2026!)`,
);

// v2 must work through the assembled signed Worker, while v1 remains compatible.
const machineId = randomUUID();
const machine = { schemaVersion: 2, machineId };
const operation = () => ({ ...machine, operationId: randomUUID() });
const capabilities = await signed("/api/sync/v2/capabilities");
assert.equal(capabilities.status, 200);
assert.equal(
	((await capabilities.json()) as { schemaVersion: number }).schemaVersion,
	2,
);
async function exchange(path: string, input: unknown) {
	const response = await signed(`/api/sync/v2${path}`, input);
	assert.equal(response.status, 200, await response.clone().text());
	return (await response.json()) as {
		result: string;
		replayed: boolean;
		claimId: string;
		remote: { stateVersion: number };
		requests: { id: string }[];
		results: { result: string }[];
		sessionId: string;
		highWater: number;
		records: { status: string; kind: string }[];
		employees: { activated: boolean }[];
	};
}
const v2Request = await rpc(
	"requests.create",
	{ ...input, idempotencyKey: randomUUID() },
	first.cookie,
	true,
);
assert.equal(v2Request.response.status, 200);
const pulled = await exchange("/requests/pull", { ...machine });
assert(pulled.requests.some((r: { id: string }) => r.id === v2Request.data.id));
const claimed = await exchange("/requests/claims", {
	...operation(),
	id: v2Request.data.id,
	expectedStateVersion: 0,
});
assert.equal(claimed.result, "claimed");
const commitInput = {
	...operation(),
	id: v2Request.data.id,
	claimId: claimed.claimId,
	expectedStateVersion: claimed.remote.stateVersion,
	version: version + 10,
	localReference: "ISOLATED-V2-001",
	status: "pending",
	canCancel: false,
};
assert.equal(
	(await exchange("/requests/claims/commit", commitInput)).result,
	"committed",
);
assert.equal(
	(await exchange("/requests/claims/commit", commitInput)).replayed,
	true,
);
assert.equal(
	(
		await rpc(
			"requests.cancelMine",
			{ id: v2Request.data.id },
			first.cookie,
			true,
		)
	).response.status,
	409,
);
const statusInput = {
	...machine,
	requests: [
		{
			operationId: randomUUID(),
			id: v2Request.data.id,
			version: version + 11,
			localReference: "ISOLATED-V2-001",
			status: "accepted",
			canCancel: false,
		},
	],
};
assert.equal(
	(await exchange("/requests/statuses", statusInput)).results[0].result,
	"acknowledged",
);
const snapshot = await exchange("/reconciliation/start", operation());
const lookup = await exchange("/reconciliation/lookup", {
	...machine,
	sessionId: snapshot.sessionId,
	requestIds: [v2Request.data.id, randomUUID()],
	catalogue: true,
});
assert.equal(lookup.records[0].status, "accepted");
assert.equal(lookup.records[1].kind, "missing");
assert(snapshot.highWater >= version + 11);
const lifecycle = await exchange("/employees/lifecycle", {
	...machine,
	employeeIds: [first.localEmployeeId],
});
assert.equal(lifecycle.employees[0].activated, true);
const changed = await exchange("/employees", {
	...machine,
	employees: [
		{
			operationId: randomUUID(),
			localEmployeeId: first.localEmployeeId,
			name: first.name,
			email: `changed-${run}@example.test`,
			enabled: true,
			version: version + 12,
			invite: false,
		},
	],
});
assert.equal(changed.results[0].result, "acknowledged");
assert.equal(
	(await rpc("requests.listMine", {}, first.cookie)).response.status,
	401,
);
assert.equal(
	(
		await exchange("/employees/lifecycle", {
			...machine,
			employeeIds: [first.localEmployeeId],
		})
	).employees[0].activated,
	false,
);
console.log(
	"PASS: assembled v2 Worker claims, import boundary, precise replay, statuses, restore snapshot and email/session revocation.",
);
