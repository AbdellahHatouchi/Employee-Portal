"use client";
import { Badge } from "@store-managment-communal-web/ui/components/badge";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@store-managment-communal-web/ui/components/card";
import { Check, Package, Plus } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
export type Product = { id: string; label: string; unit: string };
export function CatalogueProduct({
	product,
	added,
	disabled,
	onAdd,
}: {
	product: Product;
	added: boolean;
	disabled: boolean;
	onAdd: (product: Product) => void;
}) {
	const { t } = useLocale();
	return (
		<>
			<div className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0 lg:hidden">
				<div className="min-w-0 flex-1">
					<p className="wrap-break-word font-medium text-sm">
						<bdi>{product.label}</bdi>
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						<bdi>{product.unit}</bdi>
					</p>
				</div>
				<Button
					size="icon"
					className="size-11"
					variant={added ? "secondary" : "outline"}
					disabled={disabled || added}
					aria-label={`${added ? t.selected : t.add}: ${product.label}`}
					onClick={() => onAdd(product)}
				>
					{added ? <Check /> : <Plus />}
				</Button>
			</div>
			<Card className="hidden lg:flex">
				<CardHeader>
					<div className="mb-2 flex items-center justify-between gap-2">
						<Package
							className="size-5 text-muted-foreground"
							aria-hidden="true"
						/>
						<Badge variant="secondary">{t.available}</Badge>
					</div>
					<CardTitle>
						<bdi>{product.label}</bdi>
					</CardTitle>
					<CardDescription>
						{t.unit}: <bdi>{product.unit}</bdi>
					</CardDescription>
				</CardHeader>
				<CardContent className="sr-only">{product.label}</CardContent>
				<CardFooter>
					<Button
						className="w-full"
						variant={added ? "secondary" : "outline"}
						disabled={disabled || added}
						onClick={() => onAdd(product)}
					>
						{added ? (
							<Check data-icon="inline-start" />
						) : (
							<Plus data-icon="inline-start" />
						)}
						{added ? t.selected : t.add}
					</Button>
				</CardFooter>
			</Card>
		</>
	);
}
