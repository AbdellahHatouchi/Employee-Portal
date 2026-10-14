import { ResetPasswordForm } from "@/components/auth/reset-password-form";
export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ token?: string; error?: string }>;
}) {
	const { token, error } = await searchParams;
	return <ResetPasswordForm token={token} invalid={!!error} />;
}
