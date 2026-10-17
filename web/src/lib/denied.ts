import { applicationIdSchema } from "@/lib/api/schemas";
import { firstParam } from "@/lib/search-params";

// The ?application= value on the rejection guide screens, if it is a valid id.
export function applicationParam(value: string | string[] | undefined): string | null {
  const first = firstParam(value);
  return first && applicationIdSchema.safeParse(first).success ? first : null;
}
