"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
export function CataloguePagination({
	page,
	pageCount,
	total,
	disabled,
	onPage,
}: {
	page: number;
	pageCount: number;
	total: number;
	disabled: boolean;
	onPage: (page: number) => void;
}) {
	const { t, locale } = useLocale();
	const format = new Intl.NumberFormat(locale);
	return (
		<nav
			className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
			aria-label={t.catalogue}
		>
			<p className="text-muted-foreground text-xs" aria-live="polite">
				{t.page} {format.format(page)} {t.of} {format.format(pageCount)} ·{" "}
				{format.format(total)} {t.items}
			</p>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="flex-1 sm:flex-none"
					disabled={disabled || page <= 1}
					onClick={() => onPage(page - 1)}
				>
					<ChevronLeft data-icon="inline-start" className="rtl:rotate-180" />
					{t.previousPage}
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="flex-1 sm:flex-none"
					disabled={disabled || page >= pageCount}
					onClick={() => onPage(page + 1)}
				>
					{t.nextPage}
					<ChevronRight data-icon="inline-end" className="rtl:rotate-180" />
				</Button>
			</div>
		</nav>
	);
}
