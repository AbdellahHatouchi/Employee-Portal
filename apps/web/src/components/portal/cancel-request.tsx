"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@store-managment-communal-web/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n/provider";
import { queryClient, trpc } from "@/utils/trpc";
export function CancelRequest({ id }: { id: string }) {
	const { t, dir } = useLocale();
	const [open, setOpen] = useState(false);
	const cancel = useMutation(trpc.requests.cancelMine.mutationOptions());
	async function confirm() {
		try {
			await cancel.mutateAsync({ id });
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.requests.listMine.queryKey(),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.requests.getMine.queryKey({ id }),
				}),
			]);
			setOpen(false);
			toast.success(t.cancelledSuccess);
		} catch {
			toast.error(t.error);
			queryClient.invalidateQueries({
				queryKey: trpc.requests.getMine.queryKey({ id }),
			});
		}
	}
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!cancel.isPending) setOpen(value);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline">{t.cancel}</Button>
			</DialogTrigger>
			<DialogContent dir={dir} showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{t.cancelTitle}</DialogTitle>
					<DialogDescription>{t.cancelDescription}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" disabled={cancel.isPending}>
							{t.back}
						</Button>
					</DialogClose>
					<Button
						variant="destructive"
						disabled={cancel.isPending}
						onClick={confirm}
					>
						{cancel.isPending ? t.submitting : t.confirmCancel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
