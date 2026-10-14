"use client";
import { useLocale } from "@/lib/i18n/provider";
export function Footer() {
	const { t } = useLocale();
	return (
		<footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-muted-foreground text-xs sm:flex-row sm:justify-between sm:px-8">
			<p>
				{t.brand} · {t.footer}
			</p>
			<p>{t.privacy}</p>
		</footer>
	);
}
