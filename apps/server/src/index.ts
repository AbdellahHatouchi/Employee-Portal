import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "@store-managment-communal-web/api/routers/index";
import {
	completePasswordReset,
	portalResetInput,
} from "@store-managment-communal-web/auth/password-reset";
import { allowPasswordReset } from "@store-managment-communal-web/auth/reset-rate-limit";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createContext } from "./context";
import { ENV } from "./env.server";
import { createAuth, getDb } from "./services";
import { sync } from "./sync";

const app = new Hono();
app.route("/api/sync", sync);
app.onError((error, c) => {
	if (error instanceof SyntaxError)
		return c.json({ error: "Invalid JSON" }, 400);
	return c.json({ error: "Service unavailable" }, 500);
});

const requestLogger = logger();
app.use(async (c, next) => {
	// Better Auth email links can carry a reset token in the URL path.
	if (c.req.path.startsWith("/api/auth/")) await next();
	else await requestLogger(c, next);
});
app.use(
	"/*",
	cors({
		origin: ENV.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.post(
	"/api/auth/reset-password",
	bodyLimit({
		maxSize: 4096,
		onError: (c) => c.json({ code: "BODY_TOO_LARGE" }, 413),
	}),
	async (c) => {
		if (c.req.header("Origin") !== ENV.CORS_ORIGIN)
			return c.json({ code: "INVALID_ORIGIN" }, 403);
		if (
			c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
			"application/json"
		)
			return c.json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
		const parsed = portalResetInput.safeParse(await c.req.json());
		if (!parsed.success) return c.json({ code: "INVALID_PASSWORD_INPUT" }, 400);
		const db = getDb();
		if (
			!(await allowPasswordReset(
				db,
				c.req.header("CF-Connecting-IP") ?? "local",
			))
		)
			return c.json({ code: "TOO_MANY_REQUESTS" }, 429);
		const auth = await createAuth(db);
		const context = await auth.$context;
		const completed = await completePasswordReset(
			db,
			parsed.data,
			context.password.hash,
		);
		return completed
			? c.json({ status: true })
			: c.json(
					{ code: "INVALID_TOKEN", message: "Invalid or expired token" },
					400,
				);
	},
);
app.on(["POST", "GET"], "/api/auth/*", async (c) =>
	(
		await createAuth(undefined, (task) => c.executionCtx.waitUntil(task))
	).handler(c.req.raw),
);

app.use(
	"/trpc/*",
	trpcServer({
		endpoint: "/trpc",
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
