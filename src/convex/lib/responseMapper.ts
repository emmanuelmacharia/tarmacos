export function ok<TData, TMeta extends Record<string, unknown>>(data: TData, meta: TMeta) {
	return {
		ok: true as const,
		data,
		meta
	};
}
