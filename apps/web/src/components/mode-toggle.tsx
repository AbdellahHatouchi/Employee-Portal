"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale } from "@/lib/i18n/provider";
export function ModeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const { t } = useLocale();
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={t.theme}
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
		>
			<Sun className="dark:hidden" />
			<Moon className="hidden dark:block" />
		</Button>
	);
}
