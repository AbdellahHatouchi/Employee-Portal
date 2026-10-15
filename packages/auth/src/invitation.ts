import type { PasswordEmailReceipt } from "./email";

/** Better Auth catches mail failures and returns generic reset-request success.
 * Internal V2 lifecycle reporting requires evidence from the mail callback. */
export async function requirePasswordEmailAcceptance(
	requestReset: (receipt: PasswordEmailReceipt) => Promise<unknown>,
) {
	const receipt: PasswordEmailReceipt = { accepted: false };
	await requestReset(receipt);
	if (!receipt.accepted)
		throw new Error("Invitation provider acceptance was not confirmed");
}
