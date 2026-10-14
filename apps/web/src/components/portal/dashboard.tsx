"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@store-managment-communal-web/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowUpRight,
	ClipboardList,
	Clock3,
	PackageCheck,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { trpc } from "@/utils/trpc";
import { PageHeading } from "./page-heading";
import { ErrorState, LoadingState } from "./query-state";
import { RequestList } from "./request-list";
import { SessionGate } from "./session-gate";

function DashboardContent() {
	const { t } = useLocale();
	const { data: session } = authClient.useSession();
	const requests = useQuery({
		...trpc.requests.listMine.queryOptions({ limit: 50 }),
		refetchInterval: 60000,
	});
	const values = requests.data;
	const statistics = [
		{ label: t.total, icon: ClipboardList, value: values?.length },
		{
			label: t.inProgress,
			icon: Clock3,
			value: values?.filter((r) =>
				["submitted", "pending", "accepted"].includes(r.status),
			).length,
		},
		{
			label: t.completed,
			icon: PackageCheck,
			value: values?.filter((r) => r.status === "delivered").length,
		},
	];
	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
			<PageHeading
				title={`${t.welcomeBack}, ${session?.user.name ?? ""}`}
				description={t.intro}
			>
				<Button asChild>
					<Link href="/requests/new">
						<Plus data-icon="inline-start" />
						{t.newRequest}
					</Link>
				</Button>
			</PageHeading>
			<div className="grid gap-4 sm:grid-cols-3">
				{statistics.map(({ label, icon: Icon, value }) => (
					<Card key={label}>
						<CardHeader>
							<CardDescription>{label}</CardDescription>
							<CardAction>
								<Icon className="size-5 text-muted-foreground" />
							</CardAction>
							<CardTitle>
								<span className="text-3xl tabular-nums">{value ?? "—"}</span>
							</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>{t.recent}</CardTitle>
					<CardDescription>{t.historyDescription}</CardDescription>
					<CardAction>
						<Button asChild variant="ghost" size="sm">
							<Link href="/requests">
								{t.seeAll}
								<ArrowUpRight
									data-icon="inline-end"
									className="rtl:-scale-x-100"
								/>
							</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent>
					{requests.isPending ? (
						<LoadingState />
					) : requests.isError ? (
						<ErrorState
							retry={() => requests.refetch()}
							forbidden={requests.error.data?.code === "FORBIDDEN"}
						/>
					) : (
						<RequestList requests={requests.data.slice(0, 5)} />
					)}
				</CardContent>
			</Card>
			<p className="text-muted-foreground text-xs">{t.latestLimit}</p>
			<section className="flex flex-col gap-5">
				<h2 className="font-semibold text-lg">{t.howTitle}</h2>
				<div className="grid gap-6 sm:grid-cols-3">
					{[
						{ title: t.step1, description: t.step1Description },
						{ title: t.step2, description: t.step2Description },
						{ title: t.step3, description: t.step3Description },
					].map((step, index) => (
						<div key={step.title} className="flex items-start gap-3">
							<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-sm">
								{index + 1}
							</span>
							<div className="flex flex-col gap-1">
								<h3 className="font-medium text-sm">{step.title}</h3>
								<p className="text-muted-foreground text-sm leading-relaxed">
									{step.description}
								</p>
							</div>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
export function PortalDashboard() {
	return (
		<SessionGate>
			<DashboardContent />
		</SessionGate>
	);
}
