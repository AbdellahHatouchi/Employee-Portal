"use client";
import { Toaster } from "@store-managment-communal-web/ui/components/sonner";
import { TooltipProvider } from "@store-managment-communal-web/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { Locale } from "@/lib/i18n/messages";
import { LocaleProvider } from "@/lib/i18n/provider";
import { queryClient } from "@/utils/trpc";
import { ThemeProvider } from "./theme-provider";
export default function Providers({
	children,
	locale,
}: {
	children: React.ReactNode;
	locale: Locale;
}) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<LocaleProvider initialLocale={locale}>
				<TooltipProvider>
					<QueryClientProvider client={queryClient}>
						{children}
						{process.env.NODE_ENV === "development" && (
							<ReactQueryDevtools initialIsOpen={false} />
						)}
					</QueryClientProvider>
					<Toaster richColors />
				</TooltipProvider>
			</LocaleProvider>
		</ThemeProvider>
	);
}
