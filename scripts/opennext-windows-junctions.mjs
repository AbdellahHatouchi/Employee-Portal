// Windows-only build preload. Directory junctions avoid symlink privilege requirements.
// It changes only OpenNext's generated output links, never application/dependency sources.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

if (process.platform === "win32") {
	const output = path.resolve(".open-next") + path.sep;
	const standalone = path.resolve(".next/standalone") + path.sep;
	const symlink = fs.symlinkSync;
	fs.symlinkSync = (target, destination, type) => {
		try {
			return symlink(target, destination, type);
		} catch (error) {
			const absoluteTarget = path.resolve(path.dirname(destination), target);
			const absoluteDestination = path.resolve(destination);
			if (
				error.code !== "EPERM" ||
				!absoluteDestination.startsWith(output) ||
				!absoluteTarget.startsWith(standalone) ||
				!fs.statSync(absoluteTarget).isDirectory()
			)
				throw error;
			return symlink(absoluteTarget, absoluteDestination, "junction");
		}
	};
	syncBuiltinESMExports();
}
