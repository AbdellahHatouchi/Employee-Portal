import { z } from "zod";
export const catalogueInput = z
	.object({
		schemaVersion: z.literal(1),
		version: z.number().int().positive(),
		products: z
			.array(
				z.object({
					id: z.uuid(),
					label: z.string().trim().min(1).max(200),
					unit: z.string().trim().min(1).max(80),
					available: z.boolean(),
				}),
			)
			.max(500),
	})
	.refine(
		(v) => new Set(v.products.map((p) => p.id)).size === v.products.length,
	);
export const employeesInput = z.object({
	schemaVersion: z.literal(1),
	employees: z
		.array(
			z.object({
				localEmployeeId: z.uuid(),
				name: z.string().trim().min(1).max(200),
				email: z.email().transform((v) => v.toLowerCase()),
				enabled: z.boolean(),
				version: z.number().int().positive(),
				invite: z.boolean().default(true),
			}),
		)
		.min(1)
		.max(50),
});
export const statusInput = z.object({
	schemaVersion: z.literal(1),
	requests: z
		.array(
			z.object({
				id: z.uuid(),
				version: z.number().int().positive(),
				localReference: z.string().trim().min(1).max(100),
				status: z.enum([
					"pending",
					"accepted",
					"refused",
					"cancelled",
					"delivered",
				]),
				canCancel: z.boolean(),
				cancellationResolved: z.boolean().default(false),
			}),
		)
		.min(1)
		.max(50),
});
