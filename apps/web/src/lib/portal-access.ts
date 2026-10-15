import { z } from "zod";

const accessResponse = z.object({
	result: z.object({
		data: z.object({ user: z.object({ id: z.string().min(1) }) }),
	}),
});
// The API validates both the session and the current employee activation/access.
// This helper never treats the presence of a cookie as authentication.
export async function checkPortalAccess(
	apiOrigin: string,
	cookie: string,
	transport: typeof fetch = fetch,
): Promise<boolean> {
	if (!cookie) return false;
	const url = new URL("/trpc/privateData", apiOrigin);
	if (
		url.protocol !== "https:" &&
		!(
			url.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
		)
	) {
		throw new Error("Portal API origin must use HTTPS");
	}
	const response = await transport(url, {
		headers: { Cookie: cookie },
		cache: "no-store",
		redirect: "error",
		signal: AbortSignal.timeout(10000),
	});
	if (response.status === 401 || response.status === 403) return false;
	if (!response.ok) throw new Error("Portal access verification unavailable");
	if (!accessResponse.safeParse(await response.json()).success) {
		throw new Error("Invalid portal access response");
	}
	return true;
}
