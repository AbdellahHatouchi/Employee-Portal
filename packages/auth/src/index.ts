import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@store-managment-communal-web/db";
import * as schema from "@store-managment-communal-web/db/schema/auth";
import { portalPasswordTokens } from "@store-managment-communal-web/db/schema/exchange";
import {
	employeeAccounts,
	rateLimit,
} from "@store-managment-communal-web/db/schema/portal";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import {
	type EmailConfig,
	type PasswordEmailReceipt,
	sendPasswordEmail,
} from "./email";

export type AuthConfig = EmailConfig & {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
};

export function createAuth(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = [],
	backgroundTask?: (task: Promise<unknown>) => void,
	mailIdempotencyKey?: string,
	mailReceipt?: PasswordEmailReceipt,
) {
	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "sqlite",
			schema: { ...schema, rateLimit },
		}),
		trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			resetPasswordTokenExpiresIn: 1800,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url, token }) => {
				const [employee] = await database
					.select()
					.from(employeeAccounts)
					.where(eq(employeeAccounts.userId, user.id))
					.limit(1);
				if (employee?.enabled) {
					await database.insert(portalPasswordTokens).values({
						identifier: `reset-password:${token}`,
						userId: user.id,
						emailRevision: employee.emailRevision,
						email: user.email,
						expiresAt: Date.now() + 1800000,
					});
					await sendPasswordEmail(
						env,
						user.email,
						url,
						mailIdempotencyKey,
						mailReceipt,
					);
				}
			},
		},
		session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
		rateLimit: {
			enabled: true,
			storage: "database",
			window: 60,
			max: 30,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/request-password-reset": { window: 60, max: 3 },
			},
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						const [employee] = await database
							.select()
							.from(employeeAccounts)
							.where(eq(employeeAccounts.userId, session.userId))
							.limit(1);
						if (
							!employee?.enabled ||
							employee.activatedRevision !== employee.emailRevision
						)
							throw new APIError("FORBIDDEN", {
								message: "Employee account is not active",
							});
					},
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/reset-password")
					throw new APIError("BAD_REQUEST", {
						message: "Use the portal password reset handler",
						code: "PORTAL_RESET_REQUIRED",
					});
			}),
		},
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			...(backgroundTask
				? { backgroundTasks: { handler: backgroundTask } }
				: {}),
			defaultCookieAttributes: {
				sameSite: "lax",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [],
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
