import { Hono } from "hono";
import type { z } from "zod";
import type { SyncEnv } from "../authorization";
import { publishCatalogue } from "./catalogue";
import { claimRequest, commitClaim, renewClaim } from "./claims";
import * as schemas from "./contracts";
import { disposeRequest } from "./dispositions";
import { publishEmployee } from "./employees";
import {
	type InvitationSender,
	initialInvitation,
	lookupLifecycle,
	resendInvitation,
} from "./lifecycle";
import { pullRequests } from "./pull";
import {
	lookupReconciliation,
	pageReconciliation,
	startReconciliation,
} from "./reconciliation";
import {
	addCatalogueChunk,
	commitCatalogue,
	startCatalogue,
} from "./staged-catalogue";
import { publishStatus } from "./statuses";
export function createExchangeV2(
	getDatabase: () => D1Database,
	send: InvitationSender,
) {
	const app = new Hono<SyncEnv>();
	app.get("/capabilities", (c) =>
		c.json({
			schemaVersion: 2,
			signingVersion: "v1",
			employeeCancellation: "before-import-only",
			claimLeaseMs: 300000,
			reconciliationLeaseMs: 1800000,
			maxBatch: 50,
			maxBodyBytes: 262144,
			maxSnapshotProducts: 10000,
			maxChunks: 100,
		}),
	);
	function route<S extends z.ZodType>(
		path: string,
		schema: S,
		handler: (db: D1Database, input: z.infer<S>) => Promise<unknown>,
	) {
		app.post(path, async (c) => {
			if (
				c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
				"application/json"
			)
				return c.json(
					{ schemaVersion: 2, error: "unsupported-media-type" },
					415,
				);
			let body: unknown;
			try {
				body = JSON.parse(c.get("syncBody"));
			} catch {
				return c.json({ schemaVersion: 2, error: "invalid-json" }, 400);
			}
			const parsed = schema.safeParse(body);
			if (!parsed.success)
				return c.json({ schemaVersion: 2, error: "invalid-contract" }, 400);
			const result = await handler(getDatabase(), parsed.data);
			return c.json({
				schemaVersion: 2,
				...(result as Record<string, unknown>),
			});
		});
	}
	route("/employees", schemas.employeesInput, async (db, input) => {
		const results = [];
		for (const employee of input.employees) {
			const result = await publishEmployee(db, input.machineId, employee);
			if (
				employee.invite &&
				["acknowledged", "equivalent"].includes(result.result as string)
			)
				await initialInvitation(
					db,
					employee.localEmployeeId,
					employee.operationId,
					send,
				);
			results.push(result);
		}
		return { results };
	});
	route("/catalogue", schemas.catalogueInput, publishCatalogue);
	route("/requests/pull", schemas.pullInput, pullRequests);
	route("/requests/statuses", schemas.statusesInput, async (db, input) => {
		const results = [];
		for (const record of input.requests)
			results.push(await publishStatus(db, input.machineId, record));
		return { results };
	});
	route("/requests/claims", schemas.claimInput, claimRequest);
	route("/requests/claims/renew", schemas.renewInput, renewClaim);
	route("/requests/claims/commit", schemas.commitInput, commitClaim);
	route(
		"/requests/dispositions",
		schemas.dispositionsInput,
		async (db, input) => {
			const results = [];
			for (const record of input.records)
				results.push(await disposeRequest(db, input.machineId, record));
			return { results };
		},
	);
	route("/reconciliation/start", schemas.operation, startReconciliation);
	route("/reconciliation/page", schemas.reconciliationPage, pageReconciliation);
	route("/reconciliation/lookup", schemas.lookupInput, lookupReconciliation);
	route("/catalogue/snapshots/start", schemas.stageInput, startCatalogue);
	route("/catalogue/snapshots/chunk", schemas.chunkInput, addCatalogueChunk);
	route(
		"/catalogue/snapshots/commit",
		schemas.stageCommitInput,
		commitCatalogue,
	);
	route("/employees/lifecycle", schemas.lifecycleInput, lookupLifecycle);
	route("/employees/invitations", schemas.resendInput, (db, input) =>
		resendInvitation(db, input, send),
	);
	return app;
}
