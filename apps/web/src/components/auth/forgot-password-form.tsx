"use client";
import {
	Alert,
	AlertDescription,
} from "@store-managment-communal-web/ui/components/alert";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@store-managment-communal-web/ui/components/field";
import { Input } from "@store-managment-communal-web/ui/components/input";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { AuthCard } from "./auth-card";
export function ForgotPasswordForm() {
	const { t } = useLocale();
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);
	const [failed, setFailed] = useState(false);
	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (pending) return;
		setPending(true);
		setFailed(false);
		try {
			const result = await authClient.requestPasswordReset({
				email,
				redirectTo: `${window.location.origin}/reset-password`,
			});
			if (result.error) {
				setFailed(true);
				return;
			}
			setSent(true);
		} catch {
			setFailed(true);
		} finally {
			setPending(false);
		}
	}
	return (
		<AuthCard
			title={t.forgotTitle}
			description={t.forgotDescription}
			footer={
				<Button asChild variant="link">
					<Link href="/login">{t.signIn}</Link>
				</Button>
			}
		>
			{sent ? (
				<Alert>
					<AlertDescription>{t.linkSent}</AlertDescription>
				</Alert>
			) : (
				<form onSubmit={submit}>
					<FieldGroup>
						{failed && (
							<Alert variant="destructive">
								<AlertDescription>{t.error}</AlertDescription>
							</Alert>
						)}
						<Field>
							<FieldLabel htmlFor="reset-email">{t.email}</FieldLabel>
							<Input
								id="reset-email"
								type="email"
								autoComplete="email"
								dir="ltr"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={pending}
							/>
						</Field>
						<Button type="submit" disabled={pending}>
							{pending ? t.submitting : t.sendLink}
						</Button>
					</FieldGroup>
				</form>
			)}
		</AuthCard>
	);
}
