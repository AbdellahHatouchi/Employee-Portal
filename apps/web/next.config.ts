import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	async rewrites() {
		const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "");
		if (!serverUrl) return [];
		return [
			{
				source: "/api/auth/:path*",
				destination: `${serverUrl}/api/auth/:path*`,
			},
			{ source: "/trpc/:path*", destination: `${serverUrl}/trpc/:path*` },
		];
	},
};

export default nextConfig;

initOpenNextCloudflareForDev();
