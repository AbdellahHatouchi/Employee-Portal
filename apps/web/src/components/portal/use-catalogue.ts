"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { trpc } from "@/utils/trpc";
export function useCatalogue() {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState({ search: "", page: 1 });
	useEffect(() => {
		if (search.trim() === filter.search) return;
		const timer = window.setTimeout(
			() => setFilter({ search: search.trim(), page: 1 }),
			300,
		);
		return () => window.clearTimeout(timer);
	}, [search, filter.search]);
	const query = useQuery({
		...trpc.catalog.listAvailable.queryOptions({ ...filter, pageSize: 12 }),
		placeholderData: keepPreviousData,
	});
	return {
		query,
		search,
		setSearch,
		activeSearch: filter.search,
		busy: query.isFetching || search.trim() !== filter.search,
		setPage: (page: number) => setFilter((current) => ({ ...current, page })),
	};
}
