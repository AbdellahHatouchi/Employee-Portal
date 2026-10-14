"use client";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@store-managment-communal-web/ui/components/input-group";
import { Search } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
import { CataloguePagination } from "./catalogue-pagination";
import { CatalogueProduct, type Product } from "./catalogue-product";
import { EmptyState, ErrorState, LoadingState } from "./query-state";

export type { Product } from "./catalogue-product";
export function Catalogue({
	products,
	selected,
	disabled,
	onAdd,
	search,
	onSearch,
	page,
	pageCount,
	total,
	onPage,
	loading,
	busy,
	error,
	forbidden,
	retry,
}: {
	products: Product[];
	selected: string[];
	disabled: boolean;
	onAdd: (product: Product) => void;
	search: string;
	onSearch: (value: string) => void;
	page: number;
	pageCount: number;
	total: number;
	onPage: (page: number) => void;
	loading: boolean;
	busy: boolean;
	error: boolean;
	forbidden: boolean;
	retry: () => void;
}) {
	const { t } = useLocale();
	return (
		<section className="flex min-w-0 flex-col gap-4" aria-busy={busy}>
			<InputGroup>
				<InputGroupAddon>
					<Search />
				</InputGroupAddon>
				<InputGroupInput
					value={search}
					onChange={(e) => onSearch(e.target.value)}
					maxLength={200}
					placeholder={t.search}
					aria-label={t.search}
					type="search"
				/>
			</InputGroup>
			{loading ? (
				<LoadingState />
			) : error ? (
				<ErrorState retry={retry} forbidden={forbidden} />
			) : !products.length ? (
				<EmptyState
					title={search.trim() ? t.noResults : t.noProducts}
					description={
						search.trim() ? t.noResultsDescription : t.noProductsDescription
					}
				/>
			) : (
				<div className="overflow-hidden rounded-lg border bg-card lg:grid lg:grid-cols-2 lg:gap-4 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
					{products.map((product) => (
						<CatalogueProduct
							key={product.id}
							product={product}
							added={selected.includes(product.id)}
							disabled={disabled || busy || selected.length >= 30}
							onAdd={onAdd}
						/>
					))}
				</div>
			)}
			{!error && !loading && (
				<CataloguePagination
					page={page}
					pageCount={pageCount}
					total={total}
					disabled={busy}
					onPage={onPage}
				/>
			)}
		</section>
	);
}
