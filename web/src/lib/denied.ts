import { applicationIdSchema } from "@/lib/api/schemas";

// The ?application= value on the rejection guide screens, if it is a valid id.
export function applicationParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first && applicationIdSchema.safeParse(first).success ? first : null;
}
