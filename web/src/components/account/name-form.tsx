"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, failureMessage, isUnauthorized } from "@/lib/api-client/client";
import { ROUTES, signInPath } from "@/lib/routes";
import { useIsMounted } from "@/lib/use-is-mounted";

// What the student wants to be called on Home. Optional: saving it empty clears it.
export function NameForm({ name }: { name: string | null }) {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [value, setValue] = useState(name ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const unchanged = value.trim() === (name ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || unchanged) return;
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await apiRequest("patch", "/me", { body: { name: value.trim() || null } });
    if (!isMounted()) return;
    setPending(false);
    if (!result.ok) {
      if (isUnauthorized(result)) {
        router.replace(signInPath(ROUTES.settings));
        return;
      }
      setError(failureMessage(result));
      return;
    }
    setValue(result.data.name ?? "");
    setSaved(true);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <TextField
        label="Your name (optional)"
        hint="We’ll use it to greet you on Home."
        name="name"
        maxLength={60}
        autoComplete="given-name"
        placeholder="For example, Maya"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        error={error ?? undefined}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" className="h-11 w-auto px-6 text-body-m" pending={pending} disabled={unchanged}>
          Save name
        </Button>
        <p role="status" className="text-body-s text-indigo-black">
          {saved ? "Saved." : ""}
        </p>
      </div>
    </form>
  );
}
