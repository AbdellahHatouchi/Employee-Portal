import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPortalAccess } from "./portal-access";

export async function requirePortalAccess() {
	const cookie = (await cookies()).toString();
	if (!cookie) redirect("/login");
	const apiOrigin = process.env.NEXT_PUBLIC_SERVER_URL;
	if (!apiOrigin) throw new Error("Portal API origin is not configured");
	if (!(await checkPortalAccess(apiOrigin, cookie))) redirect("/login");
}
