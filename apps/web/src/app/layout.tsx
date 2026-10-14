import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import "../index.css";
import Header from "@/components/header";
import { Footer } from "@/components/portal/footer";
import Providers from "@/components/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});
const arabic = Noto_Sans_Arabic({
	variable: "--font-arabic",
	subsets: ["arabic"],
	display: "swap",
});
export const metadata: Metadata = {
	title: {
		default: "Portail communal | بوابة الموظفين",
		template: "%s | Portail communal",
	},
	description:
		"Portail des demandes de fournitures des employés — بوابة طلبات لوازم الموظفين",
};
export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const locale =
		(await cookies()).get("portal-locale")?.value === "fr" ? "fr" : "ar";
	return (
		<html
			lang={locale}
			dir={locale === "ar" ? "rtl" : "ltr"}
			suppressHydrationWarning
		>
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${arabic.variable} antialiased`}
			>
				<Providers locale={locale}>
					<div className="flex min-h-svh flex-col">
						<Header />
						<main id="main-content" className="flex-1">
							{children}
						</main>
						<Footer />
					</div>
				</Providers>
			</body>
		</html>
	);
}
