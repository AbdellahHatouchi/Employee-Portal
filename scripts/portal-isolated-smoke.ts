import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const root = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), "portal-integration-"));
const config = join(temporary, "wrangler.json");
const persist = join(temporary, "state");
const envFile = join(temporary, "empty.env");
const origin = "http://localhost:3048";
const secret = "synthetic-isolated-machine-secret-no-production-access";
const wrangler = resolve("apps/web/node_modules/wrangler/bin/wrangler.js");
await writeFile(envFile, "");
await writeFile(
	config,
	JSON.stringify({
		name: "portal-isolated-test",
		main: resolve("apps/server/src/index.ts"),
		compatibility_date: "2026-10-14",
		compatibility_flags: ["nodejs_compat"],
		vars: {
			BETTER_AUTH_URL: origin,
			CORS_ORIGIN: "http://localhost:3001",
			BETTER_AUTH_SECRET: "synthetic-isolated-auth-secret-for-local-test",
			SYNC_SECRET: secret,
		},
		d1_databases: [
			{
				binding: "DB",
				database_name: "communal-portal-local",
				database_id: crypto.randomUUID(),
			},
		],
	}),
);
let worker: ReturnType<typeof Bun.spawn> | undefined;
async function command(
	args: string[],
	env?: Record<string, string | undefined>,
) {
	const child = Bun.spawn(args, {
		cwd: root,
		env: env ?? process.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	assert.equal(await child.exited, 0, output.join("\n"));
	return output.join("\n");
}
try {
	const migrations = resolve("packages/db/src/migrations");
	const dirs = (await readdir(migrations, { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
	for (const dir of dirs)
		await command([
			"node",
			wrangler,
			"d1",
			"execute",
			"communal-portal-local",
			"--local",
			"--config",
			config,
			"--persist-to",
			persist,
			"--env-file",
			envFile,
			"--file",
			join(migrations, dir, "migration.sql"),
		]);
	worker = Bun.spawn(
		[
			"node",
			wrangler,
			"dev",
			"--local",
			"--config",
			config,
			"--persist-to",
			persist,
			"--env-file",
			envFile,
			"--port",
			"3048",
		],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	// Drain continuously so log output cannot block the Worker.
	const logs = Promise.all([
		new Response(worker.stdout).text(),
		new Response(worker.stderr).text(),
	]);
	let ready = false;
	for (let attempt = 0; attempt < 100; attempt++) {
		if (worker.exitCode !== null) throw new Error((await logs).join("\n"));
		try {
			ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok;
		} catch {}
		if (ready) break;
		await Bun.sleep(300);
	}
	assert(ready, "Isolated Worker did not become ready");
	const output = await command([process.execPath, "scripts/portal-smoke.ts"], {
		...process.env,
		PORTAL_TEST_ORIGIN: origin,
		PORTAL_TEST_SECRET: secret,
		PORTAL_TEST_CONFIG: config,
		PORTAL_TEST_PERSIST: persist,
	});
	console.log(output);
} finally {
	if (worker) {
		if (process.platform === "win32")
			await command(["taskkill", "/PID", String(worker.pid), "/T", "/F"]).catch(
				() => {},
			);
		else worker.kill();
		await worker.exited;
	}
	assert(
		resolve(temporary).startsWith(resolve(tmpdir()) + sep) &&
			temporary.includes("portal-integration-"),
	);
	if (process.platform === "win32") {
		// Use native PowerShell filesystem operations; Node/Bun recursive rm can fail with EPERM here.
		await command(
			[
				"powershell.exe",
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$taskPath = [System.IO.Path]::GetFullPath($env:PORTAL_TEST_TEMP); $taskRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()); if (-not $taskPath.StartsWith($taskRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not ([System.IO.Path]::GetFileName($taskPath)).StartsWith('portal-integration-')) { throw 'Invalid temporary target' }; Remove-Item -LiteralPath $taskPath -Recurse -Force -ErrorAction Stop",
			],
			{ ...process.env, PORTAL_TEST_TEMP: temporary },
		);
	} else {
		await command([
			"node",
			"-e",
			"require('node:fs').rmSync(process.argv[1],{recursive:true,force:true})",
			temporary,
		]);
	}
}
