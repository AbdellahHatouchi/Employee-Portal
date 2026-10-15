import { Profile } from "@/components/portal/profile";
import { requirePortalAccess } from "@/lib/require-portal-access";
export default async function Page() {
	await requirePortalAccess();
	return <Profile />;
}
