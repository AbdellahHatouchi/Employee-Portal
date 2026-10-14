"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@store-managment-communal-web/ui/components/card";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { SessionGate } from "./session-gate";

function ProfileContent() {
	const { t } = useLocale();
	const { data: session } = authClient.useSession();
	return (
		<div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
			<Card>
				<CardHeader>
					<CardTitle>{t.profile}</CardTitle>
					<CardDescription>{t.accountDescription}</CardDescription>
				</CardHeader>
				<CardContent>
					<dl className="flex flex-col gap-5">
						<div>
							<dt className="text-muted-foreground text-xs">{t.name}</dt>
							<dd className="mt-1 text-sm">{session?.user.name}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">{t.email}</dt>
							<dd className="mt-1 break-all text-sm">
								<bdi>{session?.user.email}</bdi>
							</dd>
						</div>
					</dl>
					<p className="mt-6 text-muted-foreground text-xs">
						{t.accountManaged}
					</p>
				</CardContent>
				<CardFooter>
					<Button asChild variant="outline">
						<Link href="/forgot-password">{t.forgot}</Link>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
export function Profile() {
	return (
		<SessionGate>
			<ProfileContent />
		</SessionGate>
	);
}
