"use client";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@store-managment-communal-web/ui/components/toggle-group";
import { useLocale } from "@/lib/i18n/provider";
export function LanguageSwitcher() {
	const { locale, t, setLocale } = useLocale();
	return (
		<ToggleGroup
			type="single"
			value={locale}
			onValueChange={(value) => {
				if (value === "ar" || value === "fr") setLocale(value);
			}}
			size="sm"
			variant="outline"
			aria-label={t.language}
		>
			<ToggleGroupItem value="fr" lang="fr" aria-label="Français">
				FR
			</ToggleGroupItem>
			<ToggleGroupItem value="ar" lang="ar" aria-label="العربية">
				عربي
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
