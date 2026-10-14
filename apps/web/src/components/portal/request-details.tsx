"use client";
import {
	Alert,
	AlertDescription,
} from "@store-managment-communal-web/ui/components/alert";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@store-managment-communal-web/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@store-managment-communal-web/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/provider";
import { formatDate, formatReference } from "@/lib/portal-format";
import { trpc } from "@/utils/trpc";
import { CancelRequest } from "./cancel-request";
import { PageHeading } from "./page-heading";
import { ErrorState, LoadingState } from "./query-state";
import { SessionGate } from "./session-gate";
import { StatusBadge } from "./status-badge";

function DetailsContent({ id }: { id: string }) {
	const { t, locale } = useLocale();
	const query = useQuery({
		...trpc.requests.getMine.queryOptions({ id }),
		refetchInterval: 60000,
	});
	const request = query.data;
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
			<Button asChild variant="ghost" className="w-fit">
				<Link href="/requests">
					<ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
					{t.back}
				</Link>
			</Button>
			<PageHeading
				title={t.requestDetails}
				description={t.historyDescription}
			/>
			{query.isPending ? (
				<LoadingState />
			) : query.isError ? (
				<ErrorState
					retry={() => query.refetch()}
					forbidden={query.error.data?.code === "FORBIDDEN"}
				/>
			) : (
				request && (
					<Card>
						<CardHeader>
							<CardTitle>
								<bdi className="font-mono">
									{formatReference(request.id, request.localReference)}
								</bdi>
							</CardTitle>
							<CardDescription>
								{formatDate(request.createdAt, locale)}
							</CardDescription>
							<div className="mt-2 flex flex-wrap gap-2">
								<StatusBadge status={request.status} />
							</div>
						</CardHeader>
						<CardContent className="flex flex-col gap-6">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t.items}</TableHead>
										<TableHead>{t.quantity}</TableHead>
										<TableHead>{t.unit}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{request.items.map((item) => (
										<TableRow key={item.productId}>
											<TableCell>
												<bdi>{item.label}</bdi>
											</TableCell>
											<TableCell>
												{new Intl.NumberFormat(locale).format(item.quantity)}
											</TableCell>
											<TableCell>
												<bdi>{item.unit}</bdi>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							{request.note && (
								<div className="flex flex-col gap-2">
									<h2 className="font-medium text-sm">{t.note}</h2>
									<p className="wrap-break-word whitespace-pre-wrap text-muted-foreground text-sm">
										{request.note}
									</p>
								</div>
							)}
							<Alert>
								<Info />
								<AlertDescription>
									{request.status === "pending" && request.cancelRequestedAt
										? t.cancellationPending
										: t.syncNotice}
								</AlertDescription>
							</Alert>
						</CardContent>
						{request.status === "submitted" &&
							request.canCancel &&
							!request.cancelRequestedAt && (
								<CardFooter>
									<CancelRequest id={id} />
								</CardFooter>
							)}
					</Card>
				)
			)}
		</div>
	);
}
export function RequestDetails({ id }: { id: string }) {
	return (
		<SessionGate>
			<DetailsContent id={id} />
		</SessionGate>
	);
}
