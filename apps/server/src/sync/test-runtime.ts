import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb } from "@store-managment-communal-web/db";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare } from "miniflare";
import { createMachineAuthorization } from "./machine-auth";
import { createExchangeV2 } from "./v2";
import type { InvitationSender } from "./v2/lifecycle";
export const testSecret =
	"synthetic-machine-secret-for-isolated-test-runtime-2026";
export async function createTestRuntime(
	sender: InvitationSender = async () => {},
	beforeUpgrade?: (db: D1Database) => Promise<void>,
) {
	const runtime = new Miniflare(
		convertV4MiniflareOptions({
			name: "test",
			modules: true,
			script: "export default {fetch(){return new Response('test')}}",
			compatibilityDate: "2026-10-14",
			compatibilityFlags: ["nodejs_compat"],
			d1Databases: { DB: `portal-test-${crypto.randomUUID()}` },
			log: new Log(LogLevel.ERROR),
		}),
	);
	const binding = (await runtime.getD1Database("DB")) as unknown as D1Database;
	const root = resolve(
		import.meta.dir,
		"../../../../packages/db/src/migrations",
	);
	const dirs = (await readdir(root, { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
	for (let i = 0; i < dirs.length; i++) {
		if (i === 2 && beforeUpgrade) await beforeUpgrade(binding);
		const contents = await readFile(
			resolve(root, dirs[i] as string, "migration.sql"),
			"utf8",
		);
		for (const sql of contents
			.split("--> statement-breakpoint")
			.map((v) => v.trim())
			.filter(Boolean))
			await binding.prepare(sql).run();
	}
	const app = new Hono()
		.use(
			"*",
			bodyLimit({
				maxSize: 262144,
				onError: (c) => c.json({ error: "body-too-large" }, 413),
			}),
		)
		.use(
			"*",
			createMachineAuthorization(
				() => binding,
				() => testSecret,
			),
		)
		.route(
			"/api/sync/v2",
			createExchangeV2(() => binding, sender),
		);
	app.onError((_error, c) => c.json({ error: "internal-error" }, 500));
	return { runtime, binding, db: createDb({ DB: binding }), app };
}
