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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { queryClient } from "@/utils/trpc";
import { AuthCard } from "./auth/auth-card";
import { PasswordField } from "./auth/password-field";
export default function SignInForm() {
	const { t } = useLocale();
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (pending) return;
		setPending(true);
		setFailed(false);
		try {
			const result = await authClient.signIn.email({
				email,
				password,
				rememberMe: true,
			});
			if (result.error) {
				setFailed(true);
				return;
			}
			queryClient.clear();
			router.replace("/dashboard");
			router.refresh();
		} catch {
			setFailed(true);
		} finally {
			setPending(false);
		}
	}
	return (
		<AuthCard
			title={t.signInTitle}
			description={t.signInDescription}
			footer={
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t.invitationOnly}
				</p>
			}
		>
			<form onSubmit={submit}>
				<FieldGroup>
					{failed && (
						<Alert variant="destructive">
							<AlertDescription>{t.error}</AlertDescription>
						</Alert>
					)}
					<Field>
						<FieldLabel htmlFor="email">{t.email}</FieldLabel>
						<Input
							id="email"
							name="email"
							type="email"
							dir="ltr"
							autoComplete="email"
							placeholder="prenom.nom@commune.ma"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={pending}
						/>
					</Field>
					<PasswordField
						id="password"
						label={t.password}
						value={password}
						onChange={setPassword}
						disabled={pending}
					/>
					<Button asChild variant="link" className="h-auto justify-start p-0">
						<Link href="/forgot-password">{t.forgot}</Link>
					</Button>
					<Button type="submit" disabled={pending}>
						{pending ? t.submitting : t.signIn}
					</Button>
				</FieldGroup>
			</form>
		</AuthCard>
	);
}
