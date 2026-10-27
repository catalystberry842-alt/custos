export const toJson = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? { $big: x.toString() } : x));
export const fromJson = <T = unknown>(s: string): T => JSON.parse(s, (_k, x) => (x && typeof x === "object" && "$big" in x ? BigInt((x as { $big: string }).$big) : x));
