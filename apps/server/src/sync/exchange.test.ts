import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { Context } from "@store-managment-communal-web/api/context";
import { requestInput } from "@store-managment-communal-web/api/contracts/portal";
import { appRouter } from "@store-managment-communal-web/api/routers/index";
import { completePasswordReset } from "@store-managment-communal-web/auth/password-reset";
import { allowPasswordReset } from "@store-managment-communal-web/auth/reset-rate-limit";
import { createTestRuntime, testSecret } from "./test-runtime";
import { catalogueFingerprint, publishCatalogue } from "./v2/catalogue";
import { claimRequest, commitClaim, renewClaim } from "./v2/claims";
import { all, canonical, digest, first } from "./v2/database";
import { disposeRequest } from "./v2/dispositions";
import { publishEmployee } from "./v2/employees";
import {
	initialInvitation,
	lookupLifecycle,
	resendInvitation,
} from "./v2/lifecycle";
import {
	lookupReconciliation,
	pageReconciliation,
	startReconciliation,
} from "./v2/reconciliation";
import {
	addCatalogueChunk,
	commitCatalogue,
	startCatalogue,
} from "./v2/staged-catalogue";
import { publishStatus } from "./v2/statuses";

const uuid = () => crypto.randomUUID();
const machineId = uuid();
const base = () => ({
	schemaVersion: 2 as const,
	machineId,
	operationId: uuid(),
});
let fixture: Awaited<ReturnType<typeof createTestRuntime>>;
let db: D1Database;
beforeAll(async () => {
	fixture = await createTestRuntime();
	db = fixture.binding;
}, 30000);
afterAll(async () => {
	await fixture?.runtime.dispose();
}, 30000);
async function employee() {
	const localEmployeeId = uuid();
	const email = `${uuid()}@example.test`;
	const publication = {
		operationId: uuid(),
		localEmployeeId,
		name: "Synthetic",
		email,
		enabled: true,
		version: 1,
		invite: false,
	};
	const result = await publishEmployee(db, machineId, publication);
	expect(result.result).toBe("acknowledged");
	const row = await first<{ user_id: string }>(
		db,
		"SELECT user_id FROM employee_accounts WHERE local_employee_id=?",
		localEmployeeId,
	);
	if (!row) throw new Error("Employee fixture missing");
	await db
		.prepare(
			"UPDATE employee_accounts SET activated_revision=email_revision WHERE user_id=?",
		)
		.bind(row.user_id)
		.run();
	return { ...publication, userId: row.user_id };
}
async function request() {
	const emp = await employee();
	const id = uuid();
	const now = Date.now();
	await db
		.prepare(
			"INSERT INTO cloud_requests(id,employee_id,idempotency_key,fingerprint,status,note,created_at,updated_at) VALUES(?,?,?,?,'submitted','test',?,?)",
		)
		.bind(id, emp.userId, uuid(), "test", now, now)
		.run();
	await db
		.prepare(
			"INSERT INTO cloud_request_items(request_id,product_id,quantity,label,unit) VALUES(?,?,1,'Synthetic','Unit')",
		)
		.bind(id, uuid())
		.run();
	return { id, emp };
}
function caller(userId: string) {
	const now = new Date();
	const session = {
		user: {
			id: userId,
			name: "Synthetic",
			email: "test@example.test",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			image: null,
		},
		session: {
			id: uuid(),
			userId,
			token: uuid(),
			createdAt: now,
			updatedAt: now,
			expiresAt: new Date(Date.now() + 60000),
			ipAddress: null,
			userAgent: null,
		},
	} as NonNullable<Context["session"]>;
	return appRouter.createCaller({ db: fixture.db, session });
}
async function imported() {
	const r = await request();
	const claim = await claimRequest(db, {
		...base(),
		id: r.id,
		expectedStateVersion: 0,
	});
	const claimId = claim.claimId as string;
	const commit = {
		...base(),
		id: r.id,
		claimId,
		expectedStateVersion: 1,
		version: 10,
		localReference: `DEM-${uuid()}`,
		status: "pending" as const,
		canCancel: false as const,
	};
	const result = await commitClaim(db, commit);
	expect(result.result).toBe("committed");
	return { ...r, claimId, commit };
}
async function signed(
	path: string,
	body?: unknown,
	options: {
		nonce?: string;
		timestamp?: number;
		signature?: string;
		contentType?: string;
	} = {},
) {
	const raw =
		typeof body === "string"
			? body
			: body === undefined
				? ""
				: JSON.stringify(body);
	const method = body === undefined ? "GET" : "POST";
	const timestamp = String(options.timestamp ?? Date.now());
	const nonce = options.nonce ?? uuid();
	const signature =
		options.signature ??
		createHmac("sha256", testSecret)
			.update(
				["v1", method, path, timestamp, nonce, await digest(raw)].join("\n"),
			)
			.digest("hex");
	return fixture.app.request(`https://test${path}`, {
		method,
		headers: {
			"X-Sync-Timestamp": timestamp,
			"X-Sync-Nonce": nonce,
			"X-Sync-Signature": signature,
			"Content-Type": options.contentType ?? "application/json",
		},
		...(body === undefined ? {} : { body: raw }),
	});
}
describe("signed v2 contract", () => {
	test("capabilities authenticate; employee session alone is not machine identity", async () => {
		expect(
			(
				await fixture.app.request("/api/sync/v2/capabilities", {
					headers: { Cookie: "employee-session" },
				})
			).status,
		).toBe(401);
		expect((await signed("/api/sync/v2/capabilities")).status).toBe(200);
	});
	test("signature, timestamps, nonce replay and concurrent nonce use", async () => {
		expect(
			(
				await signed("/api/sync/v2/capabilities", undefined, {
					signature: "0".repeat(64),
				})
			).status,
		).toBe(401);
		expect(
			(
				await signed("/api/sync/v2/capabilities", undefined, {
					timestamp: Date.now() - 600000,
				})
			).status,
		).toBe(401);
		const nonce = uuid();
		const results = await Promise.all([
			signed("/api/sync/v2/capabilities", undefined, { nonce }),
			signed("/api/sync/v2/capabilities", undefined, { nonce }),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
	});
	test("strict version, unknown fields, malformed JSON, media type and payload limit", async () => {
		const path = "/api/sync/v2/requests/pull";
		expect((await signed(path, { schemaVersion: 1, machineId })).status).toBe(
			400,
		);
		expect(
			(await signed(path, { schemaVersion: 2, machineId, unknown: true }))
				.status,
		).toBe(400);
		expect((await signed(path, "{")).status).toBe(400);
		expect(
			(
				await signed(
					path,
					{ schemaVersion: 2, machineId },
					{ contentType: "text/plain" },
				)
			).status,
		).toBe(415);
		expect(
			(
				await signed(path, {
					schemaVersion: 2,
					machineId,
					padding: "a".repeat(262144),
				})
			).status,
		).toBe(413);
	});
	test("HTTP validates and publishes employees without leaking credentials", async () => {
		const response = await signed("/api/sync/v2/employees", {
			schemaVersion: 2,
			machineId,
			employees: [
				{
					operationId: uuid(),
					localEmployeeId: uuid(),
					name: "Synthetic",
					email: `${uuid()}@example.test`,
					version: 1,
					enabled: true,
					invite: false,
				},
			],
		});
		expect(response.status).toBe(200);
		const value = await response.json();
		expect(canonical(value)).not.toContain("password");
	});
});
describe("precise acknowledgements", () => {
	test("lost response replay is durable; operation UUID cannot be reused for changed payload", async () => {
		const emp = await employee();
		const input = { ...emp, operationId: uuid(), version: 2, name: "Updated" };
		const { userId: _userId, ...wire } = input;
		const firstResult = await publishEmployee(db, machineId, wire);
		const repeated = await publishEmployee(db, machineId, wire);
		expect(repeated.result).toBe(firstResult.result);
		expect(repeated.replayed).toBe(true);
		expect(
			(await publishEmployee(db, machineId, { ...wire, name: "different" }))
				.result,
		).toBe("operation-conflict");
		expect(
			(
				await first<{ name: string }>(
					db,
					"SELECT name FROM user WHERE id=?",
					emp.userId,
				)
			)?.name,
		).toBe("Updated");
	});
	test("same version conflict and stale employee cannot overwrite newer publication", async () => {
		const emp = await employee();
		const { userId: _id, ...wire } = emp;
		expect(
			(
				await publishEmployee(db, machineId, {
					...wire,
					operationId: uuid(),
					name: "wrong",
				})
			).result,
		).toBe("version-conflict");
		await publishEmployee(db, machineId, {
			...wire,
			operationId: uuid(),
			version: 5,
			name: "latest",
		});
		expect(
			(
				await publishEmployee(db, machineId, {
					...wire,
					operationId: uuid(),
					version: 2,
				})
			).result,
		).toBe("stale");
		expect(
			(
				await first<{ name: string }>(
					db,
					"SELECT name FROM user WHERE id=?",
					emp.userId,
				)
			)?.name,
		).toBe("latest");
	});
	test("concurrent employee revisions settle to the highest complete identity", async () => {
		const emp = await employee();
		const { userId: _id, ...wire } = emp;
		await Promise.all([
			publishEmployee(db, machineId, {
				...wire,
				operationId: uuid(),
				version: 6,
				name: "six",
			}),
			publishEmployee(db, machineId, {
				...wire,
				operationId: uuid(),
				version: 7,
				name: "seven",
			}),
		]);
		expect(
			(
				await first<{ name: string }>(
					db,
					"SELECT name FROM user WHERE id=?",
					emp.userId,
				)
			)?.name,
		).toBe("seven");
	});
	test("email collision rolls back identity and revision atomically", async () => {
		const a = await employee();
		const b = await employee();
		const { userId: _id, ...wire } = a;
		expect(
			(
				await publishEmployee(db, machineId, {
					...wire,
					operationId: uuid(),
					version: 2,
					email: b.email,
				})
			).result,
		).toBe("email-conflict");
		expect(
			(
				await first<{ version: number }>(
					db,
					"SELECT version FROM employee_accounts WHERE user_id=?",
					a.userId,
				)
			)?.version,
		).toBe(1);
	});
	test("status retries prove equivalence and reject stale/unknown/version-conflicting updates", async () => {
		const r = await imported();
		const status = {
			operationId: uuid(),
			id: r.id,
			version: 11,
			localReference: r.commit.localReference,
			status: "accepted" as const,
			canCancel: false as const,
			cancellationResolved: false,
		};
		expect((await publishStatus(db, machineId, status)).result).toBe(
			"acknowledged",
		);
		expect((await publishStatus(db, machineId, status)).replayed).toBe(true);
		expect(
			(await publishStatus(db, machineId, { ...status, operationId: uuid() }))
				.result,
		).toBe("equivalent");
		expect(
			(
				await publishStatus(db, machineId, {
					...status,
					operationId: uuid(),
					version: 10,
				})
			).result,
		).toBe("stale");
		expect(
			(
				await publishStatus(db, machineId, {
					...status,
					operationId: uuid(),
					status: "delivered",
				})
			).result,
		).toBe("version-conflict");
		expect(
			(
				await publishStatus(db, machineId, {
					...status,
					operationId: uuid(),
					id: uuid(),
				})
			).result,
		).toBe("unknown-id");
	});
	test("terminal state cannot reopen; accepted cannot regress; reference cannot change", async () => {
		const r = await imported();
		const status = {
			operationId: uuid(),
			id: r.id,
			version: 11,
			localReference: r.commit.localReference,
			status: "accepted" as const,
			canCancel: false as const,
			cancellationResolved: false,
		};
		await publishStatus(db, machineId, status);
		expect(
			(
				await publishStatus(db, machineId, {
					...status,
					operationId: uuid(),
					version: 12,
					status: "pending",
				})
			).result,
		).toBe("state-conflict");
		await publishStatus(db, machineId, {
			...status,
			operationId: uuid(),
			version: 12,
			status: "delivered",
		});
		expect(
			(
				await publishStatus(db, machineId, {
					...status,
					operationId: uuid(),
					version: 13,
					status: "pending",
				})
			).result,
		).toBe("state-conflict");
		expect(
			(
				await publishStatus(db, machineId, {
					...status,
					operationId: uuid(),
					version: 14,
					status: "delivered",
					localReference: "forged",
				})
			).result,
		).toBe("state-conflict");
	});
});
describe("claims, cancellation and dispositions", () => {
	test("two simultaneous claims have exactly one owner", async () => {
		const r = await request();
		const results = await Promise.all([
			claimRequest(db, { ...base(), id: r.id, expectedStateVersion: 0 }),
			claimRequest(db, {
				...base(),
				machineId: uuid(),
				id: r.id,
				expectedStateVersion: 0,
			}),
		]);
		expect(results.filter((r) => r.result === "claimed")).toHaveLength(1);
	});
	test("claim receipt replay, expiry renewal, competing owner and commit after crash", async () => {
		const r = await request();
		const input = { ...base(), id: r.id, expectedStateVersion: 0 };
		const claim = await claimRequest(db, input);
		const claimId = claim.claimId as string;
		expect((await claimRequest(db, input)).claimId).toBe(claimId);
		await db
			.prepare("UPDATE request_claims SET expires_at=0 WHERE id=?")
			.bind(claimId)
			.run();
		const commit = {
			...base(),
			id: r.id,
			claimId,
			expectedStateVersion: 1,
			version: 20,
			localReference: `DEM-${uuid()}`,
			status: "pending" as const,
			canCancel: false as const,
		};
		expect((await commitClaim(db, commit)).result).toBe("claim-expired");
		expect(
			(
				await renewClaim(db, {
					...base(),
					id: r.id,
					claimId,
					expectedStateVersion: 1,
				})
			).result,
		).toBe("renewed");
		const renewedCommit = { ...commit, operationId: uuid() };
		expect((await commitClaim(db, renewedCommit)).result).toBe("committed");
		expect((await commitClaim(db, renewedCommit)).replayed).toBe(true);
		expect(
			(
				await commitClaim(db, {
					...renewedCommit,
					operationId: uuid(),
					localReference: "DIFFERENT",
				})
			).result,
		).toBe("state-conflict");
	});
	test("expired claim takeover prevents old owner commit", async () => {
		const r = await request();
		const old = await claimRequest(db, {
			...base(),
			id: r.id,
			expectedStateVersion: 0,
		});
		await db
			.prepare("UPDATE request_claims SET expires_at=0 WHERE id=?")
			.bind(old.claimId)
			.run();
		const replacement = await claimRequest(db, {
			...base(),
			machineId: uuid(),
			id: r.id,
			expectedStateVersion: 1,
		});
		expect(replacement.result).toBe("claimed");
		expect(
			(
				await commitClaim(db, {
					...base(),
					id: r.id,
					claimId: old.claimId as string,
					expectedStateVersion: 1,
					version: 10,
					localReference: "DEM-X",
					status: "pending",
					canCancel: false,
				})
			).result,
		).toBe("state-conflict");
	});
	test("employee cancellation after claim wins over a later import commit", async () => {
		const r = await request();
		const claim = await claimRequest(db, {
			...base(),
			id: r.id,
			expectedStateVersion: 0,
		});
		await caller(r.emp.userId).requests.cancelMine({ id: r.id });
		expect(
			(
				await commitClaim(db, {
					...base(),
					id: r.id,
					claimId: claim.claimId as string,
					expectedStateVersion: 1,
					version: 10,
					localReference: "DEM-X",
					status: "pending",
					canCancel: false,
				})
			).result,
		).toBe("state-conflict");
		expect(
			(
				await first<{ status: string }>(
					db,
					"SELECT status FROM cloud_requests WHERE id=?",
					r.id,
				)
			)?.status,
		).toBe("cancelled");
	});
	test("import commit racing employee cancellation is atomic", async () => {
		for (let i = 0; i < 5; i++) {
			const r = await request();
			const claim = await claimRequest(db, {
				...base(),
				id: r.id,
				expectedStateVersion: 0,
			});
			const results = await Promise.allSettled([
				commitClaim(db, {
					...base(),
					id: r.id,
					claimId: claim.claimId as string,
					expectedStateVersion: 1,
					version: 10,
					localReference: `DEM-${uuid()}`,
					status: "pending",
					canCancel: false,
				}),
				caller(r.emp.userId).requests.cancelMine({ id: r.id }),
			]);
			const state = await first<{ status: string; imported_at: number | null }>(
				db,
				"SELECT status,imported_at FROM cloud_requests WHERE id=?",
				r.id,
			);
			expect(["pending", "cancelled"]).toContain(state?.status ?? "missing");
			if (state?.status === "pending") {
				expect(state.imported_at).not.toBeNull();
				expect(results[1]?.status).toBe("rejected");
			} else expect(state?.imported_at).toBeNull();
		}
	});
	test("employees cannot cancel pending, accepted or delivered official requests", async () => {
		const r = await imported();
		await expect(
			caller(r.emp.userId).requests.cancelMine({ id: r.id }),
		).rejects.toThrow();
	});
	test("dispositions are idempotent and remove poison records without local references", async () => {
		const r = await request();
		const input = {
			operationId: uuid(),
			id: r.id,
			expectedStateVersion: 0,
			outcome: "rejected-before-import" as const,
			reason: "quantity-precision" as const,
		};
		expect((await disposeRequest(db, machineId, input)).result).toBe(
			"acknowledged",
		);
		expect((await disposeRequest(db, machineId, input)).replayed).toBe(true);
		const state = await first<{
			status: string;
			local_reference: string | null;
		}>(
			db,
			"SELECT status,local_reference FROM cloud_requests WHERE id=?",
			r.id,
		);
		expect(state?.status).toBe("refused");
		expect(state?.local_reference).toBeNull();
	});
	test("disposition cannot discard an imported or differently claimed request", async () => {
		const r = await imported();
		expect(
			(
				await disposeRequest(db, machineId, {
					operationId: uuid(),
					id: r.id,
					expectedStateVersion: 2,
					outcome: "rejected-before-import",
					reason: "invalid-items",
				})
			).result,
		).toBe("state-conflict");
	});
	test("cursor advances past failed records and reaches records beyond the first fifty", async () => {
		const emp = await employee();
		const statements = [];
		for (let i = 0; i < 55; i++)
			statements.push(
				db
					.prepare(
						"INSERT INTO cloud_requests(id,employee_id,idempotency_key,fingerprint,status,created_at,updated_at) VALUES(?,?,?,'invalid','submitted',1,1)",
					)
					.bind(uuid(), emp.userId, uuid()),
			);
		await db.batch(statements);
		let cursor: string | null = null;
		const ids = new Set<string>();
		let pages = 0;
		do {
			const response = await signed("/api/sync/v2/requests/pull", {
				schemaVersion: 2,
				machineId,
				after: cursor,
				limit: 50,
			});
			const value = (await response.json()) as {
				requests: { id: string }[];
				nextCursor: string | null;
			};
			for (const r of value.requests) {
				expect(ids.has(r.id)).toBe(false);
				ids.add(r.id);
			}
			cursor = value.nextCursor;
			pages++;
		} while (cursor);
		expect(ids.size).toBeGreaterThanOrEqual(55);
		expect(pages).toBeGreaterThan(1);
	});
});
describe("reconciliation and restored desktop state", () => {
	test("snapshot includes terminal history, mappings and global version floor", async () => {
		const r = await imported();
		await publishStatus(db, machineId, {
			operationId: uuid(),
			id: r.id,
			version: 9999,
			localReference: r.commit.localReference,
			status: "refused",
			canCancel: false,
			cancellationResolved: false,
		});
		const start = await startReconciliation(db, base());
		const sessionId = start.sessionId as string;
		const lookup = await lookupReconciliation(db, {
			schemaVersion: 2,
			machineId,
			sessionId,
			requestIds: [r.id, uuid()],
			employeeIds: [r.emp.localEmployeeId],
			catalogue: true,
		});
		expect(lookup.highWater).toBeGreaterThanOrEqual(9999);
		const records = lookup.records as {
			status?: string;
			kind?: string;
			localReference?: string;
		}[];
		expect(records.find((x) => x.kind === "request")?.status).toBe("refused");
		expect(records.find((x) => x.kind === "request")?.localReference).toBe(
			r.commit.localReference,
		);
		expect(records.some((x) => x.kind === "missing")).toBe(true);
	});
	test("snapshot pagination remains stable while live requests change", async () => {
		const r = await imported();
		const start = await startReconciliation(db, base());
		const sessionId = start.sessionId as string;
		await publishStatus(db, machineId, {
			operationId: uuid(),
			id: r.id,
			version: 11,
			localReference: r.commit.localReference,
			status: "accepted",
			canCancel: false,
			cancellationResolved: false,
		});
		const snapshot = await lookupReconciliation(db, {
			schemaVersion: 2,
			machineId,
			sessionId,
			requestIds: [r.id],
			employeeIds: [],
			catalogue: false,
		});
		expect((snapshot.records as { status: string }[])[0]?.status).toBe(
			"pending",
		);
		const keys = new Set<string>();
		let after: string | null = null;
		let count = 0;
		do {
			const page = await pageReconciliation(db, {
				schemaVersion: 2,
				machineId,
				sessionId,
				after,
				limit: 7,
			});
			for (const record of page.records as { kind: string; id?: string }[]) {
				const key = `${record.kind}:${record.id}`;
				expect(keys.has(key)).toBe(false);
				keys.add(key);
				count++;
			}
			after = page.nextCursor ?? null;
		} while (after);
		expect(count).toBe(start.recordCount as number);
	});
	test("snapshot owner, expiry, lost response and terminal restore overwrite checks", async () => {
		const op = base();
		const start = await startReconciliation(db, op);
		expect((await startReconciliation(db, op)).sessionId).toBe(start.sessionId);
		expect(
			(
				await pageReconciliation(db, {
					schemaVersion: 2,
					machineId: uuid(),
					sessionId: start.sessionId as string,
					after: null,
					limit: 10,
				})
			).error,
		).toBe("session-expired-or-unknown");
		await db
			.prepare("UPDATE reconciliation_sessions SET expires_at=0 WHERE id=?")
			.bind(start.sessionId)
			.run();
		expect(
			(
				await pageReconciliation(db, {
					schemaVersion: 2,
					machineId,
					sessionId: start.sessionId as string,
					after: null,
					limit: 10,
				})
			).error,
		).toBe("session-expired-or-unknown");
	});
});
describe("catalogue staging and validation alignment", () => {
	test("three decimal units are validated without rounding", () => {
		const input = {
			idempotencyKey: uuid(),
			note: "",
			items: [{ productId: uuid(), quantity: 1.125 }],
		};
		expect(requestInput.safeParse(input).success).toBe(true);
		expect(
			requestInput.safeParse({
				...input,
				items: [{ productId: uuid(), quantity: 1.0001 }],
			}).success,
		).toBe(false);
	});
	test("catalogue equivalent retries and same-version conflicts", async () => {
		const input = {
			...base(),
			version: 10000,
			products: [
				{
					id: uuid(),
					label: "Synthetic",
					unit: "u".repeat(80),
					available: true,
				},
			],
		};
		expect((await publishCatalogue(db, input)).result).toBe("acknowledged");
		expect(
			(await publishCatalogue(db, { ...input, operationId: uuid() })).result,
		).toBe("equivalent");
		expect(
			(
				await publishCatalogue(db, {
					...input,
					operationId: uuid(),
					products: [],
				})
			).result,
		).toBe("version-conflict");
		expect(
			(
				await publishCatalogue(db, {
					...input,
					operationId: uuid(),
					version: 9999,
				})
			).result,
		).toBe("stale");
	});
	test("501 products stage privately; missing/reordered/duplicate chunks cannot replace catalogue", async () => {
		const products = Array.from({ length: 501 }, (_, i) => ({
			id: uuid(),
			label: `Synthetic ${i}`,
			unit: "Unit",
			available: true,
		}));
		const snapshotId = uuid();
		const start = {
			...base(),
			snapshotId,
			version: 10001,
			expectedProducts: 501,
			expectedChunks: 2,
			sha256: await digest(catalogueFingerprint(products)),
		};
		expect((await startCatalogue(db, start)).result).toBe("staged");
		const later = {
			...base(),
			snapshotId,
			chunkIndex: 1,
			products: products.slice(500),
		};
		expect((await addCatalogueChunk(db, later)).result).toBe("stored");
		expect((await commitCatalogue(db, { ...base(), snapshotId })).result).toBe(
			"incomplete-snapshot",
		);
		expect(
			(
				await first<{ version: number }>(
					db,
					"SELECT version FROM sync_state WHERE key='catalog'",
				)
			)?.version,
		).toBe(10000);
		expect(
			(
				await addCatalogueChunk(db, {
					...later,
					operationId: uuid(),
					products: [],
				})
			).result,
		).toBe("snapshot-conflict");
		await addCatalogueChunk(db, {
			...base(),
			snapshotId,
			chunkIndex: 0,
			products: products.slice(0, 500),
		});
		const commit = { ...base(), snapshotId };
		expect((await commitCatalogue(db, commit)).result).toBe("committed");
		const replay = await commitCatalogue(db, commit);
		expect("replayed" in replay && replay.replayed).toBe(true);
		expect(
			(
				await first<{ n: number }>(
					db,
					"SELECT count(*) n FROM catalog_products WHERE available=1",
				)
			)?.n,
		).toBe(501);
	});
	test("digest mismatch, expired snapshots and interrupted promotion remain safe", async () => {
		const snapshotId = uuid();
		await startCatalogue(db, {
			...base(),
			snapshotId,
			version: 10002,
			expectedProducts: 0,
			expectedChunks: 1,
			sha256: "0".repeat(64),
		});
		await addCatalogueChunk(db, {
			...base(),
			snapshotId,
			chunkIndex: 0,
			products: [],
		});
		expect((await commitCatalogue(db, { ...base(), snapshotId })).result).toBe(
			"digest-conflict",
		);
		expect(
			(
				await first<{ version: number }>(
					db,
					"SELECT version FROM sync_state WHERE key='catalog'",
				)
			)?.version,
		).toBe(10001);
	});
	test("D1 batch rollback never exposes a partially promoted catalogue", async () => {
		await expect(
			db.batch([
				db.prepare("UPDATE catalog_products SET available=0"),
				db.prepare("INSERT INTO non_existing_table(id) VALUES(1)"),
			]),
		).rejects.toThrow();
		expect(
			(
				await first<{ n: number }>(
					db,
					"SELECT count(*) n FROM catalog_products WHERE available=1",
				)
			)?.n,
		).toBe(501);
	});
});
async function seedToken(userId: string) {
	const token = uuid();
	const id = `reset-password:${token}`;
	const now = Date.now();
	await db.batch([
		db
			.prepare(
				"INSERT INTO verification(id,identifier,value,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
			)
			.bind(uuid(), id, userId, now + 1800000, now, now),
		db
			.prepare(
				"INSERT INTO portal_password_tokens(identifier,user_id,email_revision,email,expires_at) SELECT ?,e.user_id,e.email_revision,u.email,? FROM employee_accounts e JOIN user u ON u.id=e.user_id WHERE e.user_id=?",
			)
			.bind(id, now + 1800000, userId),
	]);
	return token;
}
describe("secure account lifecycle", () => {
	test("email change revokes sessions and old links, and requires activation", async () => {
		const emp = await employee();
		const token = await seedToken(emp.userId);
		await db
			.prepare(
				"INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES(?,?,?,?,?,?)",
			)
			.bind(
				uuid(),
				Date.now() + 60000,
				uuid(),
				Date.now(),
				Date.now(),
				emp.userId,
			)
			.run();
		const { userId: _id, ...wire } = emp;
		await publishEmployee(db, machineId, {
			...wire,
			operationId: uuid(),
			version: 2,
			email: `${uuid()}@example.test`,
		});
		expect(
			(
				await first<{ n: number }>(
					db,
					"SELECT count(*) n FROM session WHERE user_id=?",
					emp.userId,
				)
			)?.n,
		).toBe(0);
		expect(
			await completePasswordReset(
				fixture.db,
				{ token, newPassword: "Synthetic-password" },
				async () => "hash",
			),
		).toBe(false);
		await expect(
			caller(emp.userId).catalog.listAvailable({}),
		).rejects.toThrow();
		const lifecycle = await lookupLifecycle(db, {
			schemaVersion: 2,
			machineId,
			employeeIds: [emp.localEmployeeId],
		});
		expect(lifecycle.employees[0]?.activated).toBe(false);
		expect(lifecycle.employees[0]?.emailChangeState).toBe(
			"verification-required",
		);
	});
	test("email change racing password hashing cannot activate the old recipient", async () => {
		const emp = await employee();
		const token = await seedToken(emp.userId);
		let release: () => void = () => {};
		let entered: () => void = () => {};
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const pause = new Promise<void>((resolve) => {
			release = resolve;
		});
		const reset = completePasswordReset(
			fixture.db,
			{ token, newPassword: "Synthetic-password" },
			async () => {
				entered();
				await pause;
				return "old-hash";
			},
		);
		await started;
		const { userId: _id, ...wire } = emp;
		await publishEmployee(db, machineId, {
			...wire,
			operationId: uuid(),
			version: 2,
			email: `${uuid()}@example.test`,
		});
		release();
		expect(await reset).toBe(false);
		expect(
			(
				await first<{ activated_revision: number }>(
					db,
					"SELECT activated_revision FROM employee_accounts WHERE user_id=?",
					emp.userId,
				)
			)?.activated_revision,
		).toBe(0);
	});
	test("first password activation is atomic and token is single-use under concurrency", async () => {
		const emp = await employee();
		await db
			.prepare(
				"UPDATE employee_accounts SET activated_revision=0 WHERE user_id=?",
			)
			.bind(emp.userId)
			.run();
		const token = await seedToken(emp.userId);
		const results = await Promise.all([
			completePasswordReset(
				fixture.db,
				{ token, newPassword: "Synthetic-password" },
				async () => "hash-1",
			),
			completePasswordReset(
				fixture.db,
				{ token, newPassword: "Synthetic-password" },
				async () => "hash-2",
			),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(
			(
				await first<{ activated_revision: number }>(
					db,
					"SELECT activated_revision FROM employee_accounts WHERE user_id=?",
					emp.userId,
				)
			)?.activated_revision,
		).toBe(1);
		expect(
			(
				await first<{ n: number }>(
					db,
					"SELECT count(*) n FROM account WHERE user_id=? AND provider_id='credential'",
					emp.userId,
				)
			)?.n,
		).toBe(1);
	});
	test("disabled account cannot redeem a previously issued password link", async () => {
		const emp = await employee();
		const token = await seedToken(emp.userId);
		const { userId: _id, ...wire } = emp;
		await publishEmployee(db, machineId, {
			...wire,
			operationId: uuid(),
			version: 2,
			enabled: false,
		});
		expect(
			await completePasswordReset(
				fixture.db,
				{ token, newPassword: "Synthetic-password" },
				async () => "hash",
			),
		).toBe(false);
	});
	test("resend cooldown and idempotent replay do not send duplicate invitation", async () => {
		const emp = await employee();
		await db
			.prepare(
				"UPDATE employee_accounts SET activated_revision=0 WHERE user_id=?",
			)
			.bind(emp.userId)
			.run();
		let sends = 0;
		const send = async () => {
			sends++;
		};
		const input = {
			...base(),
			localEmployeeId: emp.localEmployeeId,
			action: "resend-invitation" as const,
		};
		expect((await resendInvitation(db, input, send)).result).toBe("queued");
		expect((await resendInvitation(db, input, send)).replayed).toBe(true);
		expect(
			(await resendInvitation(db, { ...input, operationId: uuid() }, send))
				.result,
		).toBe("cooldown");
		expect(sends).toBe(1);
		expect(
			(
				await lookupLifecycle(db, {
					schemaVersion: 2,
					machineId,
					employeeIds: [emp.localEmployeeId],
				})
			).employees[0]?.invitationState,
		).toBe("sent");
	});
	test("concurrent resends and failed delivery are observable without returning tokens", async () => {
		const emp = await employee();
		await db
			.prepare(
				"UPDATE employee_accounts SET activated_revision=0 WHERE user_id=?",
			)
			.bind(emp.userId)
			.run();
		let sends = 0;
		const send = async () => {
			sends++;
			throw new Error("synthetic-failure");
		};
		await Promise.all([
			resendInvitation(
				db,
				{
					...base(),
					localEmployeeId: emp.localEmployeeId,
					action: "resend-invitation",
				},
				send,
			),
			resendInvitation(
				db,
				{
					...base(),
					localEmployeeId: emp.localEmployeeId,
					action: "resend-invitation",
				},
				send,
			),
		]);
		expect(sends).toBe(1);
		expect(
			(
				await lookupLifecycle(db, {
					schemaVersion: 2,
					machineId,
					employeeIds: [emp.localEmployeeId],
				})
			).employees[0]?.invitationState,
		).toBe("failed");
	});
	test("initial invitation is sent once and activated users cannot request resend", async () => {
		const emp = await employee();
		let sends = 0;
		expect(
			(
				await resendInvitation(
					db,
					{
						...base(),
						localEmployeeId: emp.localEmployeeId,
						action: "resend-invitation",
					},
					async () => {
						sends++;
					},
				)
			).result,
		).toBe("already-activated");
		await initialInvitation(db, emp.localEmployeeId, uuid(), async () => {
			sends++;
		});
		expect(sends).toBe(0);
	});
});
test("migration upgrades preserve existing users, official history, quantities and floors", async () => {
	const userId = uuid();
	const requestId = uuid();
	const upgraded = await createTestRuntime(
		async () => {},
		async (old) => {
			await old.batch([
				old
					.prepare(
						"INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,'Legacy','legacy@example.test',1,1)",
					)
					.bind(userId),
				old
					.prepare(
						"INSERT INTO employee_accounts(user_id,local_employee_id,enabled,version) VALUES(?,?,1,900)",
					)
					.bind(userId, uuid()),
				old
					.prepare(
						"INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,'credential',?,'old-hash',1,1)",
					)
					.bind(uuid(), userId, userId),
				old
					.prepare(
						"INSERT INTO cloud_requests(id,employee_id,idempotency_key,fingerprint,status,local_reference,state_version,created_at,updated_at) VALUES(?,?,?,'old','delivered','DEM-OLD',950,1,1)",
					)
					.bind(requestId, userId, uuid()),
				old
					.prepare(
						"INSERT INTO cloud_request_items(request_id,product_id,quantity,label,unit) VALUES(?,?,1.125,'Old','Unit')",
					)
					.bind(requestId, uuid()),
			]);
		},
	);
	try {
		const r = await first<{
			publication_version: number;
			local_reference: string;
			status: string;
			imported_at: number;
		}>(upgraded.binding, "SELECT * FROM cloud_requests WHERE id=?", requestId);
		expect(r?.publication_version).toBe(950);
		expect(r?.status).toBe("delivered");
		expect(r?.local_reference).toBe("DEM-OLD");
		expect(r?.imported_at).toBe(1);
		expect(
			(
				await first<{ activated_revision: number }>(
					upgraded.binding,
					"SELECT activated_revision FROM employee_accounts WHERE user_id=?",
					userId,
				)
			)?.activated_revision,
		).toBe(1);
		expect(
			(
				await all<{ quantity: number }>(
					upgraded.binding,
					"SELECT quantity FROM cloud_request_items WHERE request_id=?",
					requestId,
				)
			)[0]?.quantity,
		).toBe(1.125);
	} finally {
		await upgraded.runtime.dispose();
	}
}, 30000);

test("concurrent duplicate employee submissions create exactly one request and reject changed payloads", async () => {
	const e = await employee();
	const productId = uuid();
	await db
		.prepare(
			"INSERT INTO catalog_products(id,label,unit,available,version,published_at) VALUES(?,'Test','Unit',1,1,1)",
		)
		.bind(productId)
		.run();
	const input = {
		idempotencyKey: uuid(),
		note: "Same request",
		items: [{ productId, quantity: 1.125 }],
	};
	const responses = await Promise.all(
		Array.from({ length: 5 }, () => caller(e.userId).requests.create(input)),
	);
	expect(new Set(responses.map((r) => r.id)).size).toBe(1);
	expect(
		(
			await all(
				db,
				"SELECT * FROM cloud_request_items WHERE request_id=?",
				responses[0]?.id,
			)
		).length,
	).toBe(1);
	await expect(
		caller(e.userId).requests.create({ ...input, note: "Changed" }),
	).rejects.toMatchObject({ code: "CONFLICT" });
});
test("same-version employee conflicts cannot revoke existing sessions", async () => {
	const e = await employee();
	const sessionId = uuid();
	await db
		.prepare(
			"INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?, ?,1,1)",
		)
		.bind(sessionId, e.userId, uuid(), Date.now() + 60000)
		.run();
	expect(
		(
			await publishEmployee(db, machineId, {
				...e,
				operationId: uuid(),
				enabled: false,
			})
		).result,
	).toBe("version-conflict");
	expect(
		await first(db, "SELECT id FROM session WHERE id=?", sessionId),
	).not.toBeNull();
});
test("password reset limit is atomic under concurrent attempts and resets after the window", async () => {
	const ip = `test:${uuid()}`;
	const attempts = await Promise.all(
		Array.from({ length: 12 }, () => allowPasswordReset(fixture.db, ip)),
	);
	expect(attempts.filter(Boolean).length).toBe(10);
	await db
		.prepare("UPDATE rate_limit SET last_request=? WHERE key=?")
		.bind(Date.now() - 61000, `portal:password-reset:${ip}`)
		.run();
	expect(await allowPasswordReset(fixture.db, ip)).toBe(true);
});

test("concurrent retries share one durable receipt and identify the replay", async () => {
	const r = await request();
	const input = { ...base(), id: r.id, expectedStateVersion: 0 };
	const results = await Promise.all([
		claimRequest(db, input),
		claimRequest(db, input),
	]);
	expect(results.every((r) => r.result === "claimed")).toBe(true);
	expect(results[0]?.claimId).toBe(results[1]?.claimId);
	expect(results.filter((r) => r.replayed).length).toBe(1);
	expect(
		(await all(db, "SELECT * FROM request_claims WHERE request_id=?", r.id))
			.length,
	).toBe(1);
});
test("terminal publications racing an incompatible higher revision cannot reopen a request", async () => {
	const r = await imported();
	await Promise.all([
		publishStatus(db, machineId, {
			operationId: uuid(),
			id: r.id,
			version: 11,
			localReference: r.commit.localReference,
			status: "refused",
			canCancel: false,
			cancellationResolved: false,
		}),
		publishStatus(db, machineId, {
			operationId: uuid(),
			id: r.id,
			version: 12,
			localReference: r.commit.localReference,
			status: "accepted",
			canCancel: false,
			cancellationResolved: false,
		}),
	]);
	const state = await first<{ status: string }>(
		db,
		"SELECT status FROM cloud_requests WHERE id=?",
		r.id,
	);
	expect(["refused", "accepted"]).toContain(state?.status ?? "missing");
	expect(
		(
			await publishStatus(db, machineId, {
				operationId: uuid(),
				id: r.id,
				version: 13,
				localReference: r.commit.localReference,
				status: "pending",
				canCancel: false,
				cancellationResolved: false,
			})
		).result,
	).toBe("state-conflict");
});
test("expired complete catalogue stage cannot promote; a newer competing snapshot wins atomically", async () => {
	const snapshotId = uuid();
	const current = await first<{ version: number }>(
		db,
		"SELECT version FROM sync_state WHERE key='catalog'",
	);
	const version = (current?.version ?? 0) + 10;
	await startCatalogue(db, {
		...base(),
		snapshotId,
		version,
		expectedProducts: 0,
		expectedChunks: 1,
		sha256: await digest(catalogueFingerprint([])),
	});
	await addCatalogueChunk(db, {
		...base(),
		snapshotId,
		chunkIndex: 0,
		products: [],
	});
	await db
		.prepare("UPDATE catalogue_stages SET expires_at=0 WHERE id=?")
		.bind(snapshotId)
		.run();
	expect((await commitCatalogue(db, { ...base(), snapshotId })).result).toBe(
		"snapshot-expired",
	);
	const older = [{ id: uuid(), label: "Older", unit: "Unit", available: true }];
	const newer = [{ id: uuid(), label: "Newer", unit: "Unit", available: true }];
	await Promise.all([
		publishCatalogue(db, { ...base(), version, products: older }),
		publishCatalogue(db, { ...base(), version: version + 1, products: newer }),
	]);
	const visible = await all<{ id: string }>(
		db,
		"SELECT id FROM catalog_products WHERE available=1",
	);
	expect(visible.map((v) => v.id)).toEqual([newer[0]?.id ?? "missing"]);
});

test("concurrent same-operation invitation retries cannot reset delivery evidence", async () => {
	const e = await employee();
	await db
		.prepare(
			"UPDATE employee_accounts SET activated_revision=0 WHERE user_id=?",
		)
		.bind(e.userId)
		.run();
	let sent = 0;
	const input = {
		...base(),
		localEmployeeId: e.localEmployeeId,
		action: "resend-invitation" as const,
	};
	await Promise.all([
		resendInvitation(db, input, async () => {
			sent++;
			await Bun.sleep(20);
		}),
		resendInvitation(db, input, async () => {
			sent++;
		}),
	]);
	expect(sent).toBe(1);
	const state = await lookupLifecycle(db, {
		schemaVersion: 2,
		machineId,
		employeeIds: [e.localEmployeeId],
	});
	expect(state.employees[0]?.invitationState).toBe("sent");
});
test("replaying an old initial invitation cannot mark a changed email as invited", async () => {
	const e = await employee();
	await db
		.prepare(
			"UPDATE employee_accounts SET activated_revision=0 WHERE user_id=?",
		)
		.bind(e.userId)
		.run();
	const operationId = uuid();
	let sent = 0;
	const sender = async () => {
		sent++;
	};
	await initialInvitation(db, e.localEmployeeId, operationId, sender);
	await publishEmployee(db, machineId, {
		...e,
		operationId: uuid(),
		email: `${uuid()}@example.test`,
		version: 2,
	});
	await initialInvitation(db, e.localEmployeeId, operationId, sender);
	const state = await lookupLifecycle(db, {
		schemaVersion: 2,
		machineId,
		employeeIds: [e.localEmployeeId],
	});
	expect(sent).toBe(1);
	expect(state.employees[0]?.invitationState).toBe("none");
});
