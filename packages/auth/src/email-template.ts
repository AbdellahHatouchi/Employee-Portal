import { createElement } from "react";
import { render } from "react-email";
import { PortalAccessEmail } from "./portal-access-email";

export async function renderPasswordEmail(url: string) {
	return {
		html: await render(createElement(PortalAccessEmail, { url })),
		// Keep the original URL verbatim: no tracking, URL reconstruction or token changes.
		text: `Portail communal — accès au compte / بوابة الموظفين\n\nChoisissez votre mot de passe pour accéder à votre espace personnel.\nاختر كلمة مرورك للوصول إلى حسابك الشخصي.\n\n${url}\n\nCe lien personnel expire dans 30 minutes. Ne partagez pas cet e-mail.\nهذا الرابط شخصي وصالح لمدة 30 دقيقة. لا تشارك هذه الرسالة.\n\nSi vous n’avez pas demandé cet accès ou cette réinitialisation, ignorez cet e-mail.\nإذا لم تطلب الدخول أو إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.`,
	};
}
