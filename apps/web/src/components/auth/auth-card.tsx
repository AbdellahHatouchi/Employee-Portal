"use client";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@store-managment-communal-web/ui/components/card";
import { ShieldCheck } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
export function AuthCard({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
}) {
	const { t } = useLocale();
	return (
		<div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:py-20">
			<section className="hidden flex-col gap-5 lg:flex">
				<div className="flex size-12 items-center justify-center rounded-xl bg-secondary">
					<ShieldCheck className="size-6" aria-hidden="true" />
				</div>
				<h1 className="max-w-md font-semibold text-4xl leading-tight tracking-tight">
					{t.welcome}
				</h1>
				<p className="max-w-md text-muted-foreground leading-relaxed">
					{t.intro}
				</p>
				<p className="max-w-sm text-muted-foreground text-sm leading-relaxed">
					{t.invitationOnly}
				</p>
			</section>
			<Card className="mx-auto w-full max-w-md">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>{children}</CardContent>
				{footer && <CardFooter>{footer}</CardFooter>}
			</Card>
		</div>
	);
}
