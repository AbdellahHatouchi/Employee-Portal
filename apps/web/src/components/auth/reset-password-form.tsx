"use client";
import {
	Alert,
	AlertDescription,
} from "@store-managment-communal-web/ui/components/alert";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	FieldError,
	FieldGroup,
} from "@store-managment-communal-web/ui/components/field";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { AuthCard } from "./auth-card";
import { PasswordField } from "./password-field";
export function ResetPasswordForm({
	token,
	invalid,
	activation = false,
}: {
	token?: string;
	invalid?: boolean;
	activation?: boolean;
}) {
	const { t } = useLocale();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pending, setPending] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<"mismatch" | "failed" | null>(null);
	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (pending || !token) return;
		if (password !== confirm) {
			setError("mismatch");
			return;
		}
		setPending(true);
		setError(null);
		try {
			const result = await authClient.resetPassword({
				token,
				newPassword: password,
			});
			if (result.error) {
				setError("failed");
				return;
			}
			setSaved(true);
		} catch {
			setError("failed");
		} finally {
			setPending(false);
		}
	}
	return (
		<AuthCard
			title={activation ? t.activationTitle : t.resetTitle}
			description={t.resetDescription}
			footer={
				<Button asChild variant="link">
					<Link href={token && !invalid ? "/login" : "/forgot-password"}>
						{token && !invalid ? t.signIn : t.sendLink}
					</Link>
				</Button>
			}
		>
			{!token || invalid ? (
				<Alert variant="destructive">
					<AlertDescription>{t.invalidToken}</AlertDescription>
				</Alert>
			) : saved ? (
				<Alert>
					<AlertDescription>{t.resetSuccess}</AlertDescription>
				</Alert>
			) : (
				<form onSubmit={submit}>
					<FieldGroup>
						<PasswordField
							id="new-password"
							label={t.password}
							value={password}
							onChange={setPassword}
							autoComplete="new-password"
							disabled={pending}
						/>
						<PasswordField
							id="confirm-password"
							label={t.passwordConfirm}
							value={confirm}
							onChange={setConfirm}
							autoComplete="new-password"
							disabled={pending}
							invalid={error === "mismatch"}
						/>
						{error && (
							<FieldError>
								{error === "mismatch" ? t.passwordMismatch : t.invalidToken}
							</FieldError>
						)}
						<Button type="submit" disabled={pending}>
							{pending ? t.submitting : t.savePassword}
						</Button>
					</FieldGroup>
				</form>
			)}
		</AuthCard>
	);
}
