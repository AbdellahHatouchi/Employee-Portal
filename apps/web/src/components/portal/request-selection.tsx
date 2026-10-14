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
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@store-managment-communal-web/ui/components/field";
import { Textarea } from "@store-managment-communal-web/ui/components/textarea";
import { LoaderCircle, Send, Trash2 } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
import type { Product } from "./catalogue";
import { QuantityControl } from "./quantity-control";
import { EmptyState } from "./query-state";
export type SelectionItem = Product & { quantity: number };
export function RequestSelection({
	items,
	note,
	pending,
	onQuantity,
	onRemove,
	onNote,
	onSubmit,
	idPrefix = "request",
}: {
	items: SelectionItem[];
	note: string;
	pending: boolean;
	onQuantity: (id: string, value: number) => void;
	onRemove: (id: string) => void;
	onNote: (value: string) => void;
	onSubmit: () => void;
	idPrefix?: string;
}) {
	const { t } = useLocale();
	return (
		<Card className="h-fit lg:sticky lg:top-6">
			<CardHeader>
				<CardTitle>{t.selected}</CardTitle>
				<CardDescription>{t.selectedDescription}</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					{!items.length ? (
						<EmptyState
							title={t.emptySelection}
							description={t.emptySelectionDescription}
						/>
					) : (
						items.map((item) => (
							<Field
								key={item.id}
								data-invalid={
									!Number.isFinite(item.quantity) ||
									item.quantity <= 0 ||
									item.quantity > 10000
								}
							>
								<div className="flex items-center justify-between gap-2">
									<FieldLabel htmlFor={`${idPrefix}-quantity-${item.id}`}>
										<bdi>{item.label}</bdi>
									</FieldLabel>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										disabled={pending}
										aria-label={`${t.remove}: ${item.label}`}
										onClick={() => onRemove(item.id)}
									>
										<Trash2 />
									</Button>
								</div>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<QuantityControl
										id={`${idPrefix}-quantity-${item.id}`}
										label={item.label}
										value={item.quantity}
										onChange={(value) => onQuantity(item.id, value)}
										disabled={pending}
									/>
									<span className="text-muted-foreground text-xs">
										<bdi>{item.unit}</bdi>
									</span>
								</div>
							</Field>
						))
					)}
					<Field>
						<FieldLabel htmlFor={`${idPrefix}-note`}>{t.note}</FieldLabel>
						<Textarea
							id={`${idPrefix}-note`}
							maxLength={500}
							rows={3}
							value={note}
							disabled={pending}
							placeholder={t.notePlaceholder}
							onChange={(e) => onNote(e.target.value)}
						/>
					</Field>
				</FieldGroup>
			</CardContent>
			<CardFooter>
				<Button
					className="w-full"
					disabled={pending || !items.length}
					onClick={onSubmit}
				>
					{pending ? (
						<LoaderCircle data-icon="inline-start" className="animate-spin" />
					) : (
						<Send data-icon="inline-start" />
					)}
					{pending ? t.submitting : t.submit}
				</Button>
			</CardFooter>
		</Card>
	);
}
