"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@store-managment-communal-web/ui/components/table";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/provider";
import { formatDate, formatReference } from "@/lib/portal-format";
import { EmptyState } from "./query-state";
import { type RequestStatus, StatusBadge } from "./status-badge";
export type RequestSummary = {
	id: string;
	status: RequestStatus;
	createdAt: number;
	localReference: string | null;
	itemCount: number;
	cancelRequestedAt: number | null;
};
export function RequestList({ requests }: { requests: RequestSummary[] }) {
	const { t, locale } = useLocale();
	if (!requests.length)
		return (
			<EmptyState
				title={t.emptyRequests}
				description={t.emptyRequestsDescription}
				icon={ClipboardList}
			/>
		);
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>{t.reference}</TableHead>
					<TableHead>{t.date}</TableHead>
					<TableHead>{t.items}</TableHead>
					<TableHead>{t.status}</TableHead>
					<TableHead>
						<span className="sr-only">{t.details}</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{requests.map((request) => (
					<TableRow key={request.id}>
						<TableCell>
							<span className="font-mono text-xs" dir="ltr">
								{formatReference(request.id, request.localReference)}
							</span>
						</TableCell>
						<TableCell className="whitespace-nowrap">
							{formatDate(request.createdAt, locale)}
						</TableCell>
						<TableCell>{request.itemCount}</TableCell>
						<TableCell>
							<div className="flex flex-col items-start gap-1">
								<StatusBadge status={request.status} />
								{request.status === "pending" && request.cancelRequestedAt && (
									<span className="text-muted-foreground text-xs">
										{t.cancellationPending}
									</span>
								)}
							</div>
						</TableCell>
						<TableCell>
							<Button asChild variant="ghost" size="sm">
								<Link href={`/requests/${request.id}`}>{t.details}</Link>
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
