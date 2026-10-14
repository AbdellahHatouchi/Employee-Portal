import { createExchangeV2 } from "./v2";

// Hono CLI route inspection; this entry never connects to a real database.
export default createExchangeV2(
	() => {
		throw new Error("Use the isolated test runtime for database endpoints");
	},
	async () => {},
);
