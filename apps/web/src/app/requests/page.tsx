import { RequestHistory } from "@/components/portal/request-history";
import { requirePortalAccess } from "@/lib/require-portal-access";
export default async function Page() {
	await requirePortalAccess();
	return <RequestHistory />;
}
