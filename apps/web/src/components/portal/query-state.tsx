"use client";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@store-managment-communal-web/ui/components/alert";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@store-managment-communal-web/ui/components/empty";
import { Skeleton } from "@store-managment-communal-web/ui/components/skeleton";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, PackageOpen } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
export function LoadingState() {
	const { t } = useLocale();
	return (
		<div
			role="status"
			className="flex flex-col gap-4"
			aria-label={t.loading}
			aria-busy="true"
		>
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-40 w-full" />
		</div>
	);
}
export function ErrorState({
	retry,
	forbidden = false,
}: {
	retry: () => void;
	forbidden?: boolean;
}) {
	const { t } = useLocale();
	return (
		<Alert variant="destructive">
			<AlertCircle />
			<AlertTitle>{forbidden ? t.notProvisioned : t.unavailable}</AlertTitle>
			<AlertDescription>
				<p>
					{forbidden ? t.notProvisionedDescription : t.unavailableDescription}
				</p>
				<Button variant="outline" size="sm" onClick={retry}>
					{t.retry}
				</Button>
			</AlertDescription>
		</Alert>
	);
}
export function EmptyState({
	title,
	description,
	icon: Icon = PackageOpen,
}: {
	title: string;
	description: string;
	icon?: LucideIcon;
}) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
