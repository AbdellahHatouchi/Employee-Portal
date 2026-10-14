"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@store-managment-communal-web/ui/components/dialog";
import { ShoppingBag } from "lucide-react";
import type { ComponentProps } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { RequestSelection } from "./request-selection";
export function MobileRequestSelection(
	props: ComponentProps<typeof RequestSelection>,
) {
	const { t, dir, locale } = useLocale();
	return (
		<Dialog>
			<div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
				<DialogTrigger asChild>
					<Button
						className="h-11 w-full"
						disabled={!props.items.length}
						aria-label={`${t.reviewSelection}: ${props.items.length}`}
					>
						<ShoppingBag data-icon="inline-start" />
						{t.reviewSelection}
						<span className="ms-auto">
							{new Intl.NumberFormat(locale).format(props.items.length)}
						</span>
					</Button>
				</DialogTrigger>
			</div>
			<DialogContent
				dir={dir}
				showCloseButton={false}
				className="max-h-[85dvh] overflow-y-auto p-3"
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{t.selected}</DialogTitle>
					<DialogDescription>{t.selectedDescription}</DialogDescription>
				</DialogHeader>
				<RequestSelection {...props} idPrefix="mobile-request" />
				<DialogClose asChild>
					<Button variant="outline" disabled={props.pending}>
						{t.continueSelecting}
					</Button>
				</DialogClose>
			</DialogContent>
		</Dialog>
	);
}
