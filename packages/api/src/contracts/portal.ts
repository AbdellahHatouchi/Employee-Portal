import { z } from "zod";

export const requestInput = z
	.object({
		idempotencyKey: z.uuid(),
		note: z.string().trim().max(500).default(""),
		items: z
			.array(
				z.object({
					productId: z.uuid(),
					quantity: z
						.number()
						.finite()
						.positive()
						.max(10000)
						.refine(isPortalQuantity, { message: "quantity-precision" }),
				}),
			)
			.min(1)
			.max(30),
	})
	.refine(
		(value) =>
			new Set(value.items.map((item) => item.productId)).size ===
			value.items.length,
		{ message: "Duplicate products" },
	);

export function requestFingerprint(input: z.infer<typeof requestInput>) {
	return JSON.stringify({
		note: input.note,
		items: [...input.items].sort((a, b) =>
			a.productId.localeCompare(b.productId),
		),
	});
}

export function isCancellable(
	status: string,
	canCancel: boolean,
	cancelRequestedAt: number | null,
) {
	return status === "submitted" && canCancel && cancelRequestedAt === null;
}

export function isPortalQuantity(quantity: number) {
	const milliunits = Math.round(quantity * 1000);
	return (
		Number.isSafeInteger(milliunits) &&
		milliunits > 0 &&
		quantity === milliunits / 1000
	);
}
