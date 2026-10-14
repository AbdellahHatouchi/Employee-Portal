"use client";
import {
	Alert,
	AlertDescription,
} from "@store-managment-communal-web/ui/components/alert";
import { useMutation } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n/provider";
import { formatDate } from "@/lib/portal-format";
import { queryClient, trpc } from "@/utils/trpc";
import { Catalogue } from "./catalogue";
import { MobileRequestSelection } from "./mobile-request-selection";
import { PageHeading } from "./page-heading";
import { RequestSelection, type SelectionItem } from "./request-selection";
import { SessionGate } from "./session-gate";
import { useCatalogue } from "./use-catalogue";

function NewRequestContent() {
	const { t, locale } = useLocale();
	const router = useRouter();
	const catalog = useCatalogue();
	const catalogue = catalog.query;
	const [items, setItems] = useState<SelectionItem[]>([]);
	const [note, setNote] = useState("");
	const submission = useRef<{ key: string; fingerprint: string } | null>(null);
	const sending = useRef(false);
	const create = useMutation(trpc.requests.create.mutationOptions());
	async function submit() {
		if (sending.current) return;
		if (
			!items.length ||
			items.some(
				(item) =>
					!Number.isFinite(item.quantity) ||
					item.quantity <= 0 ||
					item.quantity > 10000 ||
					item.quantity !== Math.round(item.quantity * 1000) / 1000,
			)
		) {
			toast.error(t.quantityInvalid);
			return;
		}
		const lines = items.map(({ id, quantity }) => ({
			productId: id,
			quantity,
		}));
		const fingerprint = JSON.stringify({ items: lines, note });
		if (!submission.current || submission.current.fingerprint !== fingerprint)
			submission.current = { key: crypto.randomUUID(), fingerprint };
		sending.current = true;
		try {
			const result = await create.mutateAsync({
				idempotencyKey: submission.current.key,
				items: lines,
				note,
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.requests.listMine.queryKey(),
			});
			toast.success(t.submittedSuccess);
			router.push(`/requests/${result.id}`);
		} catch {
			toast.error(t.error);
			catalogue.refetch();
		} finally {
			sending.current = false;
		}
	}

	const selectionProps = {
		items,
		note,
		pending: create.isPending,
		onNote: setNote,
		onSubmit: submit,
		onRemove: (id: string) =>
			setItems((current) => current.filter((item) => item.id !== id)),
		onQuantity: (id: string, quantity: number) =>
			setItems((current) =>
				current.map((item) => (item.id === id ? { ...item, quantity } : item)),
			),
	};
	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pt-6 pb-28 sm:px-8 lg:gap-6 lg:py-8">
			<PageHeading title={t.newRequest} description={t.catalogueDescription} />
			<Alert className="hidden lg:grid">
				<Info />
				<AlertDescription>{t.syncNotice}</AlertDescription>
			</Alert>
			<details className="text-muted-foreground text-xs lg:hidden">
				<summary className="cursor-pointer">
					{t.available} · {t.catalogue}
				</summary>
				<p className="pt-2 leading-relaxed">{t.syncNotice}</p>
			</details>
			<p className="text-muted-foreground text-xs">
				{catalogue.data?.publishedAt
					? `${t.published}: ${formatDate(catalogue.data.publishedAt, locale)}`
					: t.neverPublished}
			</p>
			<div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
				<Catalogue
					products={catalogue.data?.products ?? []}
					selected={items.map((item) => item.id)}
					disabled={create.isPending}
					search={catalog.search}
					onSearch={catalog.setSearch}
					page={catalogue.data?.page ?? 1}
					pageCount={catalogue.data?.pageCount ?? 1}
					total={catalogue.data?.total ?? 0}
					onPage={catalog.setPage}
					loading={catalogue.isPending}
					busy={catalog.busy}
					error={catalogue.isError}
					forbidden={catalogue.error?.data?.code === "FORBIDDEN"}
					retry={() => catalogue.refetch()}
					onAdd={(product) =>
						setItems((current) =>
							current.some((item) => item.id === product.id)
								? current
								: [...current, { ...product, quantity: 1 }],
						)
					}
				/>
				<div className="hidden lg:sticky lg:top-6 lg:block">
					<RequestSelection {...selectionProps} />
				</div>
			</div>
			<MobileRequestSelection {...selectionProps} />
		</div>
	);
}
export function NewRequest() {
	return (
		<SessionGate>
			<NewRequestContent />
		</SessionGate>
	);
}
