"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@store-managment-communal-web/ui/components/dropdown-menu";
import { Skeleton } from "@store-managment-communal-web/ui/components/skeleton";
import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { queryClient } from "@/utils/trpc";
export default function UserMenu() {
	const router = useRouter();
	const { t, dir } = useLocale();
	const { data: session, isPending } = authClient.useSession();
	if (isPending) return <Skeleton className="size-9 rounded-full" />;
	if (!session)
		return (
			<Button asChild size="sm">
				<Link href="/login">{t.signIn}</Link>
			</Button>
		);
	return (
		<DropdownMenu dir={dir}>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<UserRound data-icon="inline-start" />
					<span className="hidden max-w-32 truncate sm:inline">
						{session.user.name}
					</span>
					<span className="sr-only sm:hidden">{t.profile}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						{session.user.name}
						<p
							className="truncate font-normal text-muted-foreground text-xs"
							dir="ltr"
						>
							{session.user.email}
						</p>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link href="/profile">
							<UserRound />
							{t.profile}
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={async () => {
							try {
								const result = await authClient.signOut();
								if (result.error) throw result.error;
								queryClient.clear();
								router.replace("/login");
								router.refresh();
							} catch {
								toast.error(t.error);
							}
						}}
					>
						<LogOut />
						{t.signOut}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
