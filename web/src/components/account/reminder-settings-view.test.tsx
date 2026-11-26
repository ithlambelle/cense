// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReminderSettings, ReminderSettingsSave } from "@/lib/api-client/reminder-settings";

import { paymentDueDetail, ReminderSettingsView } from "./reminder-settings-view";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/settings/reminders", useRouter: () => router }));

const ALL_ON: ReminderSettings = { emailsOn: true, statementClosing: true, paymentDue: true, checkAutopay: true, applicationUpdates: true };

afterEach(() => {
  vi.clearAllMocks();
});

const toggle = (name: string) => screen.getByRole("switch", { name });

describe("Payment due with autopay on", () => {
  it("says the due-date email is skipped for a card with autopay on", () => {
    render(<ReminderSettingsView settings={ALL_ON} email={null} cards={[{ name: "Discover", autopayOn: true }]} save={vi.fn()} />);
    expect(screen.getByText("Skipped while autopay is on")).toBeTruthy();
    expect(toggle("Payment due").getAttribute("aria-describedby")).toBeTruthy();
  });

  it("names only the cards it skips", () => {
    expect(paymentDueDetail([])).toBe("Before it’s due");
    expect(paymentDueDetail([{ name: "Chase", autopayOn: false }])).toBe("Before it’s due");
    expect(paymentDueDetail([{ name: "Discover", autopayOn: true }, { name: "Chase", autopayOn: false }])).toBe(
      "Before it’s due. Skipped for Discover: autopay is on",
    );
    expect(
      paymentDueDetail([
        { name: "Discover", autopayOn: true },
        { name: "Capital One", autopayOn: true },
        { name: "Chase", autopayOn: false },
      ]),
    ).toBe("Before it’s due. Skipped for Discover and Capital One: autopay is on");
  });
});

describe("ReminderSettingsView", () => {
  it("shows the three emails as the frame does, with the student's address and the one-a-day line", () => {
    render(<ReminderSettingsView settings={{ ...ALL_ON, checkAutopay: false }} email="student@example.edu" save={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Reminder settings" })).toBeTruthy();
    expect(toggle("Statement closes soon").getAttribute("aria-checked")).toBe("true");
    expect(toggle("Payment due").getAttribute("aria-checked")).toBe("true");
    expect(toggle("Check autopay").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Once, after your first statement")).toBeTruthy();
    expect(screen.getByText("student@example.edu").className).toContain("ph-sensitive");
    expect(screen.getByText("Max one a day.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Your account" }).getAttribute("href")).toBe("/settings");
  });

  it("saves one kind as it is flipped, and moves it back with the reason when the save fails", async () => {
    let answer: (value: ReminderSettingsSave) => void = () => {};
    const save = vi.fn(() => new Promise<ReminderSettingsSave>((resolve) => (answer = resolve)));
    render(<ReminderSettingsView settings={ALL_ON} email={null} save={save} />);

    fireEvent.click(toggle("Payment due"));
    expect(save).toHaveBeenCalledWith({ paymentDue: false });
    expect(toggle("Payment due").getAttribute("aria-checked")).toBe("false");
    // locked until the answer arrives
    expect(toggle("Payment due").hasAttribute("data-disabled")).toBe(true);
    await act(async () => answer({ kind: "ok", settings: { ...ALL_ON, paymentDue: false } }));
    expect(toggle("Payment due").getAttribute("aria-checked")).toBe("false");
    expect(router.refresh).toHaveBeenCalled();

    fireEvent.click(toggle("Check autopay"));
    await act(async () => answer({ kind: "failed", message: "Check your connection and try again." }));
    expect(toggle("Check autopay").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Check your connection");
  });

  it("turns every reminder off, then back on, keeping each kind as it was", async () => {
    const save = vi.fn(async (change: Partial<ReminderSettings>): Promise<ReminderSettingsSave> => ({
      kind: "ok",
      settings: { ...ALL_ON, checkAutopay: false, ...change },
    }));
    render(<ReminderSettingsView settings={{ ...ALL_ON, checkAutopay: false }} email={null} save={save} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn off all reminders" })));
    expect(save).toHaveBeenLastCalledWith({ emailsOn: false });
    expect(screen.getByText(/Reminders are off/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn reminders back on" })));
    expect(save).toHaveBeenLastCalledWith({ emailsOn: true });
    expect(toggle("Check autopay").getAttribute("aria-checked")).toBe("false");
  });

  it("says Saved. once a toggle's change is saved, and clears it when the next one starts", async () => {
    let answer: (value: ReminderSettingsSave) => void = () => {};
    const save = vi.fn(() => new Promise<ReminderSettingsSave>((resolve) => (answer = resolve)));
    render(<ReminderSettingsView settings={ALL_ON} email={null} save={save} />);
    expect(screen.getByRole("status").textContent).toBe("");

    fireEvent.click(toggle("Application updates"));
    expect(save).toHaveBeenCalledWith({ applicationUpdates: false });
    expect(screen.getByRole("status").textContent).toBe("");
    await act(async () => answer({ kind: "ok", settings: { ...ALL_ON, applicationUpdates: false } }));
    expect(screen.getByRole("status").textContent).toBe("Saved.");

    fireEvent.click(toggle("Payment due"));
    expect(screen.getByRole("status").textContent).toBe("");
    await act(async () => answer({ kind: "failed", message: "Check your connection and try again." }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("sends a signed-out student to sign in, coming back here", async () => {
    const save = vi.fn(async (): Promise<ReminderSettingsSave> => ({ kind: "signed-out" }));
    render(<ReminderSettingsView settings={ALL_ON} email={null} save={save} />);
    await act(async () => fireEvent.click(toggle("Statement closes soon")));
    expect(router.replace).toHaveBeenCalledWith("/sign-in?next=%2Fsettings%2Freminders");
    expect(toggle("Statement closes soon").getAttribute("aria-checked")).toBe("true");
  });
});
