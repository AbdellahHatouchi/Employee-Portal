"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { EmptyState, ErrorState, LoadingState } from "./query-state";
export function SessionGate({ children }: { children: React.ReactNode }) {
	const { t } = useLocale();
	const { data: session, isPending, error, refetch } = authClient.useSession();
	if (isPending)
		return (
			<div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
				<LoadingState />
			</div>
		);
	if (error)
		return (
			<div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
				<ErrorState retry={() => refetch()} />
			</div>
		);
	if (!session)
		return (
			<section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16">
				<EmptyState title={t.sessionRequired} description={t.invitationOnly} />
				<Button asChild>
					<Link href="/login">{t.signIn}</Link>
				</Button>
			</section>
		);
	return children;
}
