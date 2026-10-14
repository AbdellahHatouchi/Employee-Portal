"use client";
export function PageHeading({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-col gap-2">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{title}
				</h1>
				<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
			</div>
			{children}
		</div>
	);
}
