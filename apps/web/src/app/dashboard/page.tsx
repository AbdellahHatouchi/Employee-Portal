import { PortalDashboard } from "@/components/portal/dashboard";
import { requirePortalAccess } from "@/lib/require-portal-access";
export default async function DashboardPage() {
	await requirePortalAccess();
	return <PortalDashboard />;
}
