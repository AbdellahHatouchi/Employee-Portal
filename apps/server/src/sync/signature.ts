export async function bodyDigest(body: string) {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body),
	);
	return Array.from(new Uint8Array(hash), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function verifySignature(
	secret: string,
	signature: string,
	message: string,
) {
	if (!/^[a-f0-9]{64}$/.test(signature)) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], (byte) =>
		Number.parseInt(byte, 16),
	);
	return crypto.subtle.verify(
		"HMAC",
		key,
		bytes,
		new TextEncoder().encode(message),
	);
}
