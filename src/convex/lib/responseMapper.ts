export function ok(data: unknown, meta: Record<string, unknown>) {
	return {
		ok: true,
		data,
		meta
	};
}
