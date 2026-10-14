"use client";
import { Separator } from "@store-managment-communal-web/ui/components/separator";
import { cn } from "@store-managment-communal-web/ui/lib/utils";
import { ClipboardList, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/provider";
import { ModeToggle } from "./mode-toggle";
import { Brand } from "./portal/brand";
import { LanguageSwitcher } from "./portal/language-switcher";
import UserMenu from "./user-menu";
export default function Header() {
	const { t } = useLocale();
	const path = usePathname();
	const authPage = [
		"/login",
		"/forgot-password",
		"/reset-password",
		"/activate",
	].includes(path);
	const links = [
		{ href: "/dashboard", label: t.dashboard, icon: LayoutDashboard },
		{ href: "/requests/new", label: t.newRequest, icon: Plus },
		{ href: "/requests", label: t.requests, icon: ClipboardList },
	] as const;
	return (
		<header className="bg-card">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
				<Brand />
				<div className="flex items-center gap-2">
					<LanguageSwitcher />
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
			{!authPage && (
				<nav
					aria-label={t.tagline}
					className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 sm:px-8"
				>
					{links.map(({ href, label, icon: Icon }) => (
						<Link
							key={href}
							href={href}
							aria-current={
								path === href || (href === "/dashboard" && path === "/")
									? "page"
									: undefined
							}
							className={cn(
								"flex shrink-0 items-center gap-2 border-transparent border-b-2 px-3 py-3 text-muted-foreground text-sm transition-colors hover:text-foreground",
								(path === href || (path === "/" && href === "/dashboard")) &&
									"border-primary font-medium text-primary",
							)}
						>
							<Icon className="size-4" aria-hidden="true" />
							{label}
						</Link>
					))}
				</nav>
			)}
			<Separator />
		</header>
	);
}
