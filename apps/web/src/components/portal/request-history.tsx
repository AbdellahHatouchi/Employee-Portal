"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@store-managment-communal-web/ui/components/card";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@store-managment-communal-web/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { trpc } from "@/utils/trpc";
import { PageHeading } from "./page-heading";
import { EmptyState, ErrorState, LoadingState } from "./query-state";
import { RequestList } from "./request-list";
import { SessionGate } from "./session-gate";

function HistoryContent() {
	const { t, dir } = useLocale();
	const [status, setStatus] = useState("all");
	const requests = useQuery({
		...trpc.requests.listMine.queryOptions({ limit: 50 }),
		refetchInterval: 60000,
	});
	const visible =
		requests.data?.filter(
			(request) => status === "all" || status === request.status,
		) ?? [];
	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-8">
			<PageHeading title={t.requests} description={t.historyDescription}>
				<Button asChild>
					<Link href="/requests/new">
						<Plus data-icon="inline-start" />
						{t.newRequest}
					</Link>
				</Button>
			</PageHeading>
			<Card>
				<CardHeader>
					<CardTitle>{t.requests}</CardTitle>
					<CardDescription>{t.latestLimit}</CardDescription>
					<Select dir={dir} value={status} onValueChange={setStatus}>
						<SelectTrigger aria-label={t.status} className="mt-2 w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent dir={dir}>
							<SelectGroup>
								<SelectItem value="all">{t.all}</SelectItem>
								{Object.entries(t.statuses).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</CardHeader>
				<CardContent>
					{requests.isPending ? (
						<LoadingState />
					) : requests.isError ? (
						<ErrorState
							retry={() => requests.refetch()}
							forbidden={requests.error.data?.code === "FORBIDDEN"}
						/>
					) : status !== "all" && !visible.length ? (
						<EmptyState
							title={t.noResults}
							description={t.noResultsDescription}
						/>
					) : (
						<RequestList requests={visible} />
					)}
				</CardContent>
			</Card>
		</div>
	);
}
export function RequestHistory() {
	return (
		<SessionGate>
			<HistoryContent />
		</SessionGate>
	);
}
