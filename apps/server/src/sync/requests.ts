import {
	cloudRequestItems,
	cloudRequests,
	employeeAccounts,
} from "@store-managment-communal-web/db/schema/portal";
import {
	and,
	asc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../services";
import type { SyncEnv } from "./authorization";
import { statusInput } from "./contracts";

export const requestSync = new Hono<SyncEnv>()
	.get("/", async (c) => {
		const db = getDb();
		const requests = await db
			.select()
			.from(cloudRequests)
			.where(
				or(
					eq(cloudRequests.status, "submitted"),
					and(
						inArray(cloudRequests.status, ["pending", "accepted"]),
						isNotNull(cloudRequests.cancelRequestedAt),
					),
				),
			)
			.orderBy(asc(cloudRequests.createdAt))
			.limit(50);
		if (!requests.length) return c.json({ schemaVersion: 1, requests: [] });
		const items = await db
			.select()
			.from(cloudRequestItems)
			.where(
				inArray(
					cloudRequestItems.requestId,
					requests.map((r) => r.id),
				),
			);
		const employees = await db
			.select()
			.from(employeeAccounts)
			.where(
				inArray(
					employeeAccounts.userId,
					requests.map((r) => r.employeeId),
				),
			);
		return c.json({
			schemaVersion: 1,
			requests: requests.map(
				({
					fingerprint: _fingerprint,
					idempotencyKey: _key,
					publicationVersion: _publicationVersion,
					publicationFingerprint: _publicationFingerprint,
					claimId: _claimId,
					importedAt: _importedAt,
					dispositionReason: _dispositionReason,
					...request
				}) => ({
					...request,
					localEmployeeId: employees.find(
						(e) => e.userId === request.employeeId,
					)?.localEmployeeId,
					items: items.filter((item) => item.requestId === request.id),
				}),
			),
		});
	})
	.post("/statuses", async (c) => {
		const parsed = statusInput.safeParse(JSON.parse(c.get("syncBody")));
		if (!parsed.success)
			return c.json({ error: "Invalid request statuses" }, 400);
		const db = getDb();
		const results = [];
		for (const update of parsed.data.requests) {
			const result = await db
				.update(cloudRequests)
				.set({
					status: update.status,
					localReference: update.localReference,
					stateVersion: sql`${cloudRequests.stateVersion} + 1`,
					publicationVersion: update.version,
					publicationFingerprint: JSON.stringify({
						localReference: update.localReference,
						status: update.status,
						canCancel: false,
						cancellationResolved: update.cancellationResolved,
					}),
					importedAt: sql`coalesce(${cloudRequests.importedAt}, ${Date.now()})`,
					canCancel: false,
					...(update.cancellationResolved ? { cancelRequestedAt: null } : {}),
					updatedAt: Date.now(),
				})
				.where(
					and(
						eq(cloudRequests.id, update.id),
						lt(cloudRequests.publicationVersion, update.version),
						isNull(cloudRequests.claimId),
						or(
							isNotNull(cloudRequests.importedAt),
							and(
								eq(cloudRequests.status, "submitted"),
								sql`${update.status} = 'pending'`,
							),
						),
						sql`(${cloudRequests.localReference} IS NULL OR ${cloudRequests.localReference} = ${update.localReference})`,
						sql`(${cloudRequests.status} = ${update.status} OR (${cloudRequests.status} = 'submitted' AND ${update.status} = 'pending') OR (${cloudRequests.status} = 'pending' AND ${update.status} IN ('accepted','refused','cancelled')) OR (${cloudRequests.status} = 'accepted' AND ${update.status} IN ('delivered','cancelled')))`,
					),
				)
				.returning({ id: cloudRequests.id });
			results.push({
				id: update.id,
				result: result.length ? "acknowledged" : "unchanged",
			});
		}
		return c.json({ schemaVersion: 1, results });
	});
