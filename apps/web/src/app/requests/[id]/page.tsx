import { RequestDetails } from "@/components/portal/request-details";
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <RequestDetails id={id} />;
}
