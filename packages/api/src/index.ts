import { employeeAccounts } from "@store-managment-communal-web/db/schema/portal";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({
	errorFormatter({ shape, error }) {
		return {
			...shape,
			message:
				error.code === "INTERNAL_SERVER_ERROR"
					? "Service unavailable"
					: shape.message,
			data: { ...shape.data, stack: undefined },
		};
	},
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "No session",
		});
	}
	const [employee] = await ctx.db
		.select()
		.from(employeeAccounts)
		.where(eq(employeeAccounts.userId, ctx.session.user.id))
		.limit(1);
	if (
		!employee?.enabled ||
		employee.activatedRevision !== employee.emailRevision
	)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Employee account is disabled or not provisioned",
		});
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});
