"use client";

import { useNow } from "@/lib/use-now";

// The date and greeting use the student's own clock and time zone (see useNow).
function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Greeting({ subtitle }: { subtitle: string }) {
  const date = useNow();

  return (
    <div className="flex flex-col gap-1.5">
      <p className="min-h-5 text-body-s text-indigo-black uppercase" suppressHydrationWarning>
        {date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}
      </p>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 font-medium text-navy">{date ? greetingFor(date.getHours()) : "Hello"}</h1>
        <p className="text-body-m text-indigo-black">{subtitle}</p>
      </div>
    </div>
  );
}
