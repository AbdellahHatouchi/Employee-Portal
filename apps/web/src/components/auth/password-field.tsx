"use client";
import {
	Field,
	FieldLabel,
} from "@store-managment-communal-web/ui/components/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@store-managment-communal-web/ui/components/input-group";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
export function PasswordField({
	id,
	label,
	value,
	onChange,
	disabled,
	autoComplete = "current-password",
	invalid = false,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	autoComplete?: string;
	invalid?: boolean;
}) {
	const [visible, setVisible] = useState(false);
	return (
		<Field data-invalid={invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<InputGroup>
				<InputGroupInput
					id={id}
					name={id}
					type={visible ? "text" : "password"}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					required
					minLength={8}
					maxLength={128}
					autoComplete={autoComplete}
					disabled={disabled}
					aria-invalid={invalid}
					dir="ltr"
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						aria-label={label}
						aria-pressed={visible}
						onClick={() => setVisible(!visible)}
						disabled={disabled}
					>
						{visible ? <EyeOff /> : <Eye />}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</Field>
	);
}
