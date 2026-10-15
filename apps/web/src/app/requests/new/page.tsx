import { NewRequest } from "@/components/portal/new-request";
import { requirePortalAccess } from "@/lib/require-portal-access";
export default async function Page() {
	await requirePortalAccess();
	return <NewRequest />;
}
