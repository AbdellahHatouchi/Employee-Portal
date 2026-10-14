import { z } from "zod";

const uuid = z.uuid();
export const version = z
	.number()
	.int()
	.min(1)
	.max(Number.MAX_SAFE_INTEGER - 1);
const revision = z
	.number()
	.int()
	.min(0)
	.max(Number.MAX_SAFE_INTEGER - 1);
export const machine = z
	.object({ schemaVersion: z.literal(2), machineId: uuid })
	.strict();
export const operation = machine.extend({ operationId: uuid }).strict();
export const product = z
	.object({
		id: uuid,
		label: z.string().trim().min(1).max(200),
		unit: z.string().trim().min(1).max(80),
		available: z.boolean(),
	})
	.strict();
export const employeeRecord = z
	.object({
		operationId: uuid,
		localEmployeeId: uuid,
		name: z.string().trim().min(1).max(200),
		email: z.email().transform((v) => v.toLowerCase()),
		enabled: z.boolean(),
		version,
		invite: z.boolean().default(true),
	})
	.strict();
export const employeesInput = machine
	.extend({ employees: z.array(employeeRecord).min(1).max(50) })
	.strict();
export const statusRecord = z
	.object({
		operationId: uuid,
		id: uuid,
		version,
		localReference: z.string().trim().min(1).max(100),
		status: z.enum([
			"pending",
			"accepted",
			"refused",
			"cancelled",
			"delivered",
		]),
		canCancel: z.literal(false),
		cancellationResolved: z.boolean().default(false),
	})
	.strict();
export const statusesInput = machine
	.extend({ requests: z.array(statusRecord).min(1).max(50) })
	.strict();
export const pullInput = machine
	.extend({
		after: uuid.nullable().default(null),
		limit: z.number().int().min(1).max(50).default(50),
	})
	.strict();
export const claimInput = operation
	.extend({ id: uuid, expectedStateVersion: revision })
	.strict();
export const renewInput = claimInput.extend({ claimId: uuid }).strict();
export const commitInput = renewInput
	.extend({
		version,
		localReference: z.string().trim().min(1).max(100),
		status: z.literal("pending"),
		canCancel: z.literal(false),
	})
	.strict();
export const dispositionsInput = machine
	.extend({
		records: z
			.array(
				z
					.object({
						operationId: uuid,
						id: uuid,
						expectedStateVersion: revision,
						outcome: z.literal("rejected-before-import"),
						reason: z.enum([
							"employee-unavailable",
							"product-unavailable",
							"quantity-precision",
							"invalid-items",
							"unsupported-record",
						]),
					})
					.strict(),
			)
			.min(1)
			.max(50),
	})
	.strict();
export const catalogueInput = operation
	.extend({ version, products: z.array(product).max(500) })
	.strict()
	.refine(
		(v) => new Set(v.products.map((p) => p.id)).size === v.products.length,
	);
export const stageInput = operation
	.extend({
		snapshotId: uuid,
		version,
		expectedProducts: z.number().int().min(0).max(10000),
		expectedChunks: z.number().int().min(1).max(100),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
export const chunkInput = operation
	.extend({
		snapshotId: uuid,
		chunkIndex: z.number().int().min(0).max(99),
		products: z.array(product).max(500),
	})
	.strict();
export const stageCommitInput = operation.extend({ snapshotId: uuid }).strict();
export const sessionInput = machine.extend({ sessionId: uuid }).strict();
export const reconciliationPage = sessionInput
	.extend({
		after: z.string().max(100).nullable().default(null),
		limit: z.number().int().min(1).max(50).default(50),
	})
	.strict();
export const lookupInput = sessionInput
	.extend({
		employeeIds: z.array(uuid).max(50).default([]),
		requestIds: z.array(uuid).max(50).default([]),
		catalogue: z.boolean().default(false),
	})
	.strict();
export const lifecycleInput = machine
	.extend({ employeeIds: z.array(uuid).min(1).max(50) })
	.strict();
export const resendInput = operation
	.extend({ localEmployeeId: uuid, action: z.literal("resend-invitation") })
	.strict();
