import type { Locale } from "./i18n/messages";
export function formatDate(value: number, locale: Locale) {
	return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : "fr-MA", {
		dateStyle: "medium",
		timeZone: "Africa/Casablanca",
	}).format(value);
}
export function formatReference(id: string, localReference: string | null) {
	return localReference ?? id.slice(0, 8).toUpperCase();
}
