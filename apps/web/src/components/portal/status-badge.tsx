"use client";
import { Badge } from "@store-managment-communal-web/ui/components/badge";
import { Check, Clock3, Truck, X } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
export type RequestStatus =
	| "submitted"
	| "pending"
	| "accepted"
	| "refused"
	| "cancelled"
	| "delivered";
export function StatusBadge({ status }: { status: RequestStatus }) {
	const { t } = useLocale();
	const Icon =
		status === "delivered"
			? Truck
			: status === "accepted"
				? Check
				: status === "refused" || status === "cancelled"
					? X
					: Clock3;
	return (
		<Badge
			variant={
				status === "accepted" || status === "delivered"
					? "default"
					: status === "refused"
						? "destructive"
						: "secondary"
			}
		>
			<Icon />
			{t.statuses[status]}
		</Badge>
	);
}
