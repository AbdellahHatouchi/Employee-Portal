import {
	catalogProducts,
	syncState,
} from "@store-managment-communal-web/db/schema/portal";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const catalogRouter = router({
	listAvailable: protectedProcedure
		.input(
			z
				.object({
					search: z.string().trim().max(200).default(""),
					page: z.number().int().min(1).max(10000).default(1),
					pageSize: z.number().int().min(1).max(48).default(12),
				})
				.default({ search: "", page: 1, pageSize: 12 }),
		)
		.query(async ({ ctx, input }) => {
			const filter = and(
				eq(catalogProducts.available, true),
				input.search
					? sql`instr(lower(${catalogProducts.label}), lower(${input.search})) > 0`
					: undefined,
			);
			const [counts, state] = await Promise.all([
				ctx.db
					.select({ total: sql<number>`count(*)` })
					.from(catalogProducts)
					.where(filter),
				ctx.db
					.select()
					.from(syncState)
					.where(eq(syncState.key, "catalog"))
					.limit(1),
			]);
			const total = counts[0]?.total ?? 0;
			const pageCount = Math.max(1, Math.ceil(total / input.pageSize));
			const page = Math.min(input.page, pageCount);
			const products = await ctx.db
				.select({
					id: catalogProducts.id,
					label: catalogProducts.label,
					unit: catalogProducts.unit,
				})
				.from(catalogProducts)
				.where(filter)
				.orderBy(asc(catalogProducts.label), asc(catalogProducts.id))
				.limit(input.pageSize)
				.offset((page - 1) * input.pageSize);
			return {
				products,
				publishedAt: state[0]?.updatedAt ?? null,
				total,
				page,
				pageSize: input.pageSize,
				pageCount,
			};
		}),
});
