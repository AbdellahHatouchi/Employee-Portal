import { RequestDetails } from "@/components/portal/request-details";
import { requirePortalAccess } from "@/lib/require-portal-access";
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	await requirePortalAccess();
	const { id } = await params;
	return <RequestDetails id={id} />;
}
