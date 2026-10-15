import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve(import.meta.dir, "../packages/db/src/migrations");
const destination = resolve(
	import.meta.dir,
	"../apps/server/.production-migrations",
);
mkdirSync(destination, { recursive: true });
const names = readdirSync(source)
	.filter((name) => /^\d{14}_/.test(name))
	.sort();
if (!names.length) throw new Error("No tracked production migrations found");
for (const name of names)
	copyFileSync(
		resolve(source, name, "migration.sql"),
		resolve(destination, `${name}.sql`),
	);
console.log(
	`Prepared ${names.length} tracked SQL migrations; D1 records each applied filename`,
);
