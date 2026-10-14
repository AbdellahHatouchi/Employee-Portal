"use client";
import { Button } from "@store-managment-communal-web/ui/components/button";
import { Input } from "@store-managment-communal-web/ui/components/input";
import { Minus, Plus } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
export function QuantityControl({
	id,
	label,
	value,
	onChange,
	disabled,
}: {
	id: string;
	label: string;
	value: number;
	onChange: (value: number) => void;
	disabled: boolean;
}) {
	const { t } = useLocale();
	const valid =
		Number.isFinite(value) &&
		value > 0 &&
		value <= 10000 &&
		value === Math.round(value * 1000) / 1000;
	return (
		<div className="flex items-center gap-1" dir="ltr">
			<Button
				type="button"
				size="icon"
				variant="outline"
				disabled={disabled || value <= 1}
				aria-label={`${t.remove}: ${label}`}
				onClick={() => onChange(Math.max(1, value - 1))}
			>
				<Minus />
			</Button>
			<Input
				id={id}
				type="number"
				inputMode="decimal"
				min="0.001"
				max="10000"
				step="0.001"
				aria-label={`${t.quantity}: ${label}`}
				aria-invalid={!valid}
				className="w-20 text-center"
				value={Number.isNaN(value) ? "" : value}
				onChange={(e) => onChange(e.target.valueAsNumber)}
				disabled={disabled}
			/>
			<Button
				type="button"
				size="icon"
				variant="outline"
				disabled={disabled || value >= 10000}
				aria-label={`${t.add}: ${label}`}
				onClick={() => onChange(value + 1)}
			>
				<Plus />
			</Button>
		</div>
	);
}
