/** @jsxImportSource react */

import type { CSSProperties } from "react";
import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Link,
	Preview,
	Section,
	Text,
} from "react-email";

export function PortalAccessEmail({ url }: { url: string }) {
	return (
		<Html lang="fr" dir="ltr">
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light" />
				<meta name="supported-color-schemes" content="light" />
			</Head>
			<Preview>
				Votre accès au portail communal — choisissez votre mot de passe. تفعيل
				الدخول إلى بوابة الموظفين
			</Preview>
			<Body style={body}>
				<Container style={container}>
					<Section style={{ textAlign: "center", padding: "0 0 24px" }}>
						<Text style={brand}>PORTAIL COMMUNAL</Text>
						<Text
							lang="ar"
							dir="rtl"
							style={{ ...small, margin: "6px 0 0", color: "#525252" }}
						>
							بوابة الموظفين · تدبير طلبات اللوازم
						</Text>
					</Section>
					<Section style={card}>
						<Section style={{ padding: "32px 24px 0" }}>
							<Text style={eyebrow}>VOTRE ESPACE EMPLOYÉ</Text>
							<Heading as="h1" style={heading}>
								Votre accès au portail
							</Heading>
							<Text style={paragraph}>Bonjour,</Text>
							<Text style={paragraph}>
								Choisissez votre mot de passe pour accéder à votre espace
								personnel et suivre vos demandes de fournitures.
							</Text>
							<Section
								lang="ar"
								dir="rtl"
								style={{ textAlign: "right", padding: "4px 0 8px" }}
							>
								<Heading
									as="h2"
									style={{
										...arabic,
										fontSize: "22px",
										lineHeight: "34px",
										fontWeight: 700,
										color: "#171717",
										margin: "14px 0 8px",
									}}
								>
									مرحباً بك في بوابة الموظفين
								</Heading>
								<Text style={{ ...paragraph, ...arabic }}>
									اختر كلمة مرورك للوصول إلى حسابك الشخصي ومتابعة طلبات اللوازم.
								</Text>
							</Section>
							<Section style={{ textAlign: "center", margin: "16px 0 24px" }}>
								<Button href={url} style={button}>
									<span style={{ display: "block" }}>
										Choisir mon mot de passe
									</span>
									<span
										lang="ar"
										dir="rtl"
										style={{
											...arabic,
											display: "block",
											fontSize: "15px",
											fontWeight: 400,
											lineHeight: "26px",
										}}
									>
										تعيين كلمة المرور
									</span>
								</Button>
							</Section>
							<Section
								style={{
									backgroundColor: "#f5f5f5",
									border: "1px solid #e5e5e5",
									borderRadius: "10px",
									padding: "14px 16px",
								}}
							>
								<Text
									style={{
										...small,
										color: "#262626",
										margin: "0 0 4px",
										fontWeight: 700,
									}}
								>
									Un lien personnel, valable 30 minutes
								</Text>
								<Text style={{ ...small, margin: "0" }}>
									Pour votre sécurité, ne partagez pas cet e-mail.
								</Text>
								<Text
									lang="ar"
									dir="rtl"
									style={{
										...small,
										...arabic,
										textAlign: "right",
										margin: "8px 0 0",
									}}
								>
									هذا الرابط شخصي وصالح لمدة 30 دقيقة. حفاظاً على أمان حسابك، لا
									تشارك هذه الرسالة.
								</Text>
							</Section>
							<Hr style={{ borderColor: "#e5e5e5", margin: "28px 0 22px" }} />
							<Text style={{ ...small, margin: "0 0 8px" }}>
								Le bouton ne fonctionne pas ? Copiez ce lien dans votre
								navigateur.
							</Text>
							<Text
								lang="ar"
								dir="rtl"
								style={{
									...small,
									...arabic,
									textAlign: "right",
									margin: "0 0 12px",
								}}
							>
								إذا لم يعمل الزر، انسخ الرابط وافتحه في المتصفح.
							</Text>
							<Text
								dir="ltr"
								style={{
									margin: "0 0 28px",
									fontSize: "12px",
									lineHeight: "20px",
									wordBreak: "break-all",
									overflowWrap: "anywhere",
								}}
							>
								<Link
									href={url}
									style={{ color: "#525252", textDecoration: "underline" }}
								>
									{url}
								</Link>
							</Text>
						</Section>
					</Section>
					<Section style={{ padding: "20px 20px 0", textAlign: "center" }}>
						<Text
							style={{
								...small,
								fontSize: "12px",
								lineHeight: "20px",
								margin: "0 0 8px",
							}}
						>
							Si vous n’avez pas demandé cet accès ou cette réinitialisation,
							vous pouvez ignorer cet e-mail.
						</Text>
						<Text
							lang="ar"
							dir="rtl"
							style={{
								...small,
								...arabic,
								fontSize: "12px",
								lineHeight: "22px",
								margin: 0,
							}}
						>
							إذا لم تطلب الدخول أو إعادة تعيين كلمة المرور، يمكنك تجاهل هذه
							الرسالة.
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

const arabic: CSSProperties = { fontFamily: "Tahoma, Arial, sans-serif" };
const body: CSSProperties = {
	backgroundColor: "#f5f5f4",
	color: "#171717",
	fontFamily: "Arial, Helvetica, sans-serif",
	margin: 0,
	padding: "32px 12px",
};
const container: CSSProperties = { maxWidth: "560px", margin: "0 auto" };
const brand: CSSProperties = {
	fontSize: "13px",
	lineHeight: "20px",
	fontWeight: 700,
	letterSpacing: "2px",
	color: "#171717",
	margin: 0,
};
const card: CSSProperties = {
	backgroundColor: "#ffffff",
	border: "1px solid #e5e5e5",
	borderTop: "4px solid #171717",
	borderRadius: "16px",
};
const eyebrow: CSSProperties = {
	color: "#737373",
	fontSize: "11px",
	lineHeight: "18px",
	fontWeight: 700,
	letterSpacing: "1.5px",
	margin: "0 0 12px",
};
const heading: CSSProperties = {
	color: "#171717",
	fontSize: "30px",
	lineHeight: "38px",
	fontWeight: 700,
	letterSpacing: "-0.6px",
	margin: "0 0 24px",
};
const paragraph: CSSProperties = {
	color: "#525252",
	fontSize: "15px",
	lineHeight: "26px",
	margin: "0 0 12px",
};
const small: CSSProperties = {
	color: "#737373",
	fontSize: "13px",
	lineHeight: "22px",
};
const button: CSSProperties = {
	backgroundColor: "#171717",
	borderRadius: "9px",
	color: "#ffffff",
	fontSize: "15px",
	fontWeight: 700,
	lineHeight: "24px",
	padding: "14px 22px",
	textAlign: "center",
	textDecoration: "none",
	boxSizing: "border-box",
	maxWidth: "100%",
};
