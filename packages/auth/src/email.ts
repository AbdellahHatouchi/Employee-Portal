export type EmailConfig = { RESEND_API_KEY?: string; RESEND_FROM?: string };

export async function sendPasswordEmail(
	env: EmailConfig,
	to: string,
	url: string,
	idempotencyKey?: string,
) {
	if (!env.RESEND_API_KEY || !env.RESEND_FROM)
		throw new Error("Transactional email is not configured");
	const response = await fetch("https://api.resend.com/emails", {
		signal: AbortSignal.timeout(10000),
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		},
		body: JSON.stringify({
			from: env.RESEND_FROM,
			to: [to],
			subject: "Portail communal — accès au compte / تفعيل الحساب",
			text: `Choisissez votre mot de passe / اختر كلمة المرور\n\n${url}\n\nCe lien expire dans 30 minutes. / تنتهي صلاحية الرابط بعد 30 دقيقة.\nSi vous n’avez pas demandé ce lien, ignorez cet e-mail.`,
		}),
	});
	if (!response.ok) throw new Error("Email delivery failed");
}
