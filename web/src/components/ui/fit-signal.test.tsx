// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FitSignal } from "./fit-signal"

const bars = (container: HTMLElement) => Array.from(container.querySelectorAll("[aria-hidden='true'] > span"))
const lit = (container: HTMLElement, color: string) => bars(container).filter((bar) => bar.classList.contains(color)).length

describe("FitSignal", () => {
  it("shows a likely fit as three green bars and its name", () => {
    const { container } = render(<FitSignal tier="likely_fit" />)
    expect(screen.getByText("Likely fit")).toBeTruthy()
    expect(bars(container)).toHaveLength(3)
    expect(lit(container, "bg-green")).toBe(3)
  })

  it("shows a stretch as one amber bar of three and its name", () => {
    const { container } = render(<FitSignal tier="stretch" />)
    expect(screen.getByText("Stretch")).toBeTruthy()
    expect(lit(container, "bg-amber")).toBe(1)
    expect(lit(container, "bg-indigo-black/15")).toBe(2)
  })

  it("names the tier for screen readers and hides the bars from them", () => {
    const { container } = render(<FitSignal tier="stretch" />)
    expect(container.textContent).toBe("Fit: Stretch")
    expect(container.querySelector("[aria-hidden='true']")?.textContent).toBe("")
  })

  it("never shows the old capitalised pill", () => {
    render(<FitSignal tier="likely_fit" />)
    expect(screen.queryByText("LIKELY FIT")).toBeNull()
  })
})
