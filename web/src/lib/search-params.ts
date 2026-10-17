// The first value of a search param. Next gives an array when the address
// repeats a name (?next=a&next=b); only the first one counts.
export function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
