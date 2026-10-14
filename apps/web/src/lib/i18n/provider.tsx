"use client";
import { DirectionProvider } from "@store-managment-communal-web/ui/components/direction";
import { createContext, useContext, useState } from "react";
import { type Locale, type Messages, messages } from "./messages";

const LocaleContext = createContext<{
	locale: Locale;
	dir: "rtl" | "ltr";
	t: Messages;
	setLocale: (locale: Locale) => void;
} | null>(null);
export function LocaleProvider({
	initialLocale,
	children,
}: {
	initialLocale: Locale;
	children: React.ReactNode;
}) {
	const [locale, setLanguage] = useState(initialLocale);
	const dir = locale === "ar" ? "rtl" : "ltr";
	function setLocale(value: Locale) {
		setLanguage(value);
		document.documentElement.lang = value;
		document.documentElement.dir = value === "ar" ? "rtl" : "ltr";
		// biome-ignore lint/suspicious/noDocumentCookie: Safari-compatible non-sensitive language preference, also read by the server layout.
		document.cookie = `portal-locale=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
	}
	return (
		<LocaleContext.Provider
			value={{ locale, dir, t: messages[locale], setLocale }}
		>
			<DirectionProvider direction={dir}>{children}</DirectionProvider>
		</LocaleContext.Provider>
	);
}
export function useLocale() {
	const context = useContext(LocaleContext);
	if (!context) throw new Error("LocaleProvider is required");
	return context;
}
