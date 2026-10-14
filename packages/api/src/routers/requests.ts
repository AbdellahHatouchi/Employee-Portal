import {
	catalogProducts,
	cloudRequestItems,
	cloudRequests,
} from "@store-managment-communal-web/db/schema/portal";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requestFingerprint, requestInput } from "../contracts/portal";
import { protectedProcedure, router } from "../index";
import { limitSubmissions } from "../rate-limit";

export const requestsRouter = router({
	listMine: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(100).default(50) })
				.default({ limit: 50 }),
		)
		.query(({ ctx, input }) =>
			ctx.db
				.select({
					id: cloudRequests.id,
					status: cloudRequests.status,
					createdAt: cloudRequests.createdAt,
					localReference: cloudRequests.localReference,
					canCancel: cloudRequests.canCancel,
					cancelRequestedAt: cloudRequests.cancelRequestedAt,
					itemCount: sql<number>`(select count(*) from cloud_request_items where request_id = ${cloudRequests.id})`,
				})
				.from(cloudRequests)
				.where(eq(cloudRequests.employeeId, ctx.session.user.id))
				.orderBy(desc(cloudRequests.createdAt))
				.limit(input.limit),
		),

	getMine: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const [request] = await ctx.db
				.select()
				.from(cloudRequests)
				.where(
					and(
						eq(cloudRequests.id, input.id),
						eq(cloudRequests.employeeId, ctx.session.user.id),
					),
				)
				.limit(1);
			if (!request) throw new TRPCError({ code: "NOT_FOUND" });
			const items = await ctx.db
				.select({
					productId: cloudRequestItems.productId,
					quantity: cloudRequestItems.quantity,
					label: cloudRequestItems.label,
					unit: cloudRequestItems.unit,
				})
				.from(cloudRequestItems)
				.where(eq(cloudRequestItems.requestId, request.id));
			const {
				fingerprint: _fingerprint,
				idempotencyKey: _key,
				employeeId: _employee,
				publicationFingerprint: _publicationFingerprint,
				claimId: _claimId,
				...visible
			} = request;
			return { ...visible, items };
		}),

	create: protectedProcedure
		.input(requestInput)
		.mutation(async ({ ctx, input }) => {
			const fingerprint = requestFingerprint(input);
			const findExisting = async () => {
				const [existing] = await ctx.db
					.select()
					.from(cloudRequests)
					.where(
						and(
							eq(cloudRequests.employeeId, ctx.session.user.id),
							eq(cloudRequests.idempotencyKey, input.idempotencyKey),
						),
					)
					.limit(1);
				if (existing && existing.fingerprint !== fingerprint)
					throw new TRPCError({
						code: "CONFLICT",
						message: "Idempotency key already used",
					});
				return existing;
			};
			const existing = await findExisting();
			if (existing) return { id: existing.id };
			await limitSubmissions(ctx.db, ctx.session.user.id);
			const products = await ctx.db
				.select()
				.from(catalogProducts)
				.where(
					and(
						eq(catalogProducts.available, true),
						inArray(
							catalogProducts.id,
							input.items.map((item) => item.productId),
						),
					),
				);
			if (products.length !== input.items.length)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Catalogue changed. Refresh and try again.",
				});
			const id = crypto.randomUUID();
			const now = Date.now();
			const byId = new Map(products.map((product) => [product.id, product]));
			try {
				// D1 batch is atomic: a failed line cannot leave an incomplete request.
				await ctx.db.batch([
					ctx.db.insert(cloudRequests).values({
						id,
						employeeId: ctx.session.user.id,
						idempotencyKey: input.idempotencyKey,
						fingerprint,
						note: input.note,
						createdAt: now,
						updatedAt: now,
					}),
					ctx.db.insert(cloudRequestItems).values(
						input.items.map((item) => {
							const product = byId.get(item.productId);
							if (!product) throw new TRPCError({ code: "BAD_REQUEST" });
							return {
								requestId: id,
								productId: item.productId,
								quantity: item.quantity,
								label: product.label,
								unit: product.unit,
							};
						}),
					),
				]);
			} catch (error) {
				const duplicate = await findExisting();
				if (duplicate) return { id: duplicate.id };
				throw error;
			}
			return { id };
		}),

	cancelMine: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const now = Date.now();
			// Conditional update also protects against a desktop acceptance racing cancellation.
			const result = await ctx.db
				.update(cloudRequests)
				.set({
					status: "cancelled",
					stateVersion: sql`${cloudRequests.stateVersion} + 1`,
					cancelRequestedAt: now,
					canCancel: false,
					updatedAt: now,
				})
				.where(
					and(
						eq(cloudRequests.id, input.id),
						eq(cloudRequests.employeeId, ctx.session.user.id),
						eq(cloudRequests.status, "submitted"),
						isNull(cloudRequests.importedAt),
						eq(cloudRequests.canCancel, true),
						isNull(cloudRequests.cancelRequestedAt),
					),
				)
				.returning({ id: cloudRequests.id });
			if (!result.length)
				throw new TRPCError({
					code: "CONFLICT",
					message: "Cancellation no longer available",
				});
			return { id: input.id };
		}),
});
