import { PortalDashboard } from "@/components/portal/dashboard";
import { requirePortalAccess } from "@/lib/require-portal-access";
export default async function Home() {
	await requirePortalAccess();
	return <PortalDashboard />;
}
