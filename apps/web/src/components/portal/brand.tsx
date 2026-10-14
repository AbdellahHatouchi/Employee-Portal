"use client";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/provider";
export function Brand() {
	const { t } = useLocale();
	return (
		<Link href="/" className="flex items-center gap-3">
			<span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
				<Building2 className="size-5" aria-hidden="true" />
			</span>
			<span className="flex flex-col gap-0.5">
				<span className="font-semibold tracking-tight">{t.brand}</span>
				<span className="text-muted-foreground text-xs">{t.tagline}</span>
			</span>
		</Link>
	);
}
