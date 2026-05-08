export type OkResponse<TData, TMeta extends Record<string, unknown> = Record<string, unknown>> = {
	ok: true;
	data: TData;
	meta: TMeta;
};

export function ok<TData, TMeta extends Record<string, unknown> = Record<string, unknown>>(
	data: TData,
	meta: TMeta
): OkResponse<TData, TMeta> {
	return {
		ok: true,
		data,
		meta
	};
}
