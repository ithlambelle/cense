// @vitest-environment jsdom
// Created with Claude Code (2026-11-19).
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Accordion, AccordionSection } from "./accordion"

function Three({ defaultOpen }: { defaultOpen?: string | null }) {
  return (
    <Accordion defaultOpen={defaultOpen}>
      <AccordionSection value="dates" title="Your dates" summary="Statement closes day 18 · due day 12">
        <p>Statement closes · Day 18</p>
      </AccordionSection>
      <AccordionSection value="rewards" title="Rewards" summary="5% in rotating categories, 1% on the rest">
        <a href="/somewhere">A link inside</a>
      </AccordionSection>
      <AccordionSection value="fees" title="Fees and rates" summary="$0 annual fee · 0% foreign fee" sensitive="ph-sensitive">
        <p>Annual fee · $0</p>
      </AccordionSection>
    </Accordion>
  )
}

const trigger = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) })
// The panel a title's button controls (aria-controls), open or closed.
const panel = (title: string) => {
  const found = document.getElementById(trigger(title).getAttribute("aria-controls") ?? "")
  if (!found) throw new Error(`${title} controls no panel`)
  return found
}
const expanded = () =>
  screen.getAllByRole("button").filter((button) => button.getAttribute("aria-expanded") === "true").map((button) => button.textContent)

describe("Accordion", () => {
  it("opens the default section on arrival and keeps the others closed", () => {
    render(<Three defaultOpen="dates" />)
    expect(trigger("Your dates").getAttribute("aria-expanded")).toBe("true")
    expect(panel("Your dates").hidden).toBe(false)
    expect(trigger("Rewards").getAttribute("aria-expanded")).toBe("false")
    expect(panel("Rewards").hidden).toBe(true)
    expect(panel("Fees and rates").hidden).toBe(true)
  })

  it("starts with every section closed when no default is given", () => {
    render(<Three />)
    expect(expanded()).toEqual([])
  })

  it("keeps one section open at a time: opening one closes the other", () => {
    render(<Three defaultOpen="dates" />)
    fireEvent.click(trigger("Rewards"))
    expect(expanded()).toEqual([expect.stringMatching(/^Rewards/)])
    expect(panel("Rewards").hidden).toBe(false)
    expect(panel("Your dates").hidden).toBe(true)
    fireEvent.click(trigger("Fees and rates"))
    expect(expanded()).toEqual([expect.stringMatching(/^Fees and rates/)])
  })

  it("closes the open section when it is tapped again", () => {
    render(<Three defaultOpen="dates" />)
    fireEvent.click(trigger("Your dates"))
    expect(expanded()).toEqual([])
    expect(panel("Your dates").hidden).toBe(true)
  })

  it("names each button by its title and summary, and points it at its panel", () => {
    render(<Three defaultOpen="dates" />)
    const button = trigger("Your dates")
    expect(button.textContent).toBe("Your datesStatement closes day 18 · due day 12")
    expect(button.getAttribute("type")).toBe("button")
    // The open panel is a region named by the title alone.
    expect(screen.getByRole("region", { name: "Your dates" })).toBe(panel("Your dates"))
    expect(screen.getAllByRole("region")).toHaveLength(1)
    // Each title button sits in a heading.
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3)
    expect(button.closest("h2")).not.toBeNull()
  })

  it("hides a closed section's links from the keyboard and screen readers", () => {
    render(<Three defaultOpen="dates" />)
    expect(screen.queryByRole("link", { name: "A link inside" })).toBeNull()
    fireEvent.click(trigger("Rewards"))
    expect(screen.getByRole("link", { name: "A link inside" })).toBeTruthy()
  })

  it("moves between titles with the arrow keys, Home and End, wrapping at the ends", () => {
    render(<Three defaultOpen="dates" />)
    trigger("Your dates").focus()
    fireEvent.keyDown(trigger("Your dates"), { key: "ArrowDown" })
    expect(document.activeElement).toBe(trigger("Rewards"))
    fireEvent.keyDown(trigger("Rewards"), { key: "ArrowDown" })
    expect(document.activeElement).toBe(trigger("Fees and rates"))
    fireEvent.keyDown(trigger("Fees and rates"), { key: "ArrowDown" })
    expect(document.activeElement).toBe(trigger("Your dates"))
    fireEvent.keyDown(trigger("Your dates"), { key: "ArrowUp" })
    expect(document.activeElement).toBe(trigger("Fees and rates"))
    fireEvent.keyDown(trigger("Fees and rates"), { key: "Home" })
    expect(document.activeElement).toBe(trigger("Your dates"))
    fireEvent.keyDown(trigger("Your dates"), { key: "End" })
    expect(document.activeElement).toBe(trigger("Fees and rates"))
    // Moving focus never opens or closes anything.
    expect(expanded()).toEqual([expect.stringMatching(/^Your dates/)])
  })

  it("leaves the arrow keys alone inside an open section's body", () => {
    render(<Three defaultOpen="rewards" />)
    const link = screen.getByRole("link", { name: "A link inside" })
    link.focus()
    fireEvent.keyDown(link, { key: "ArrowDown" })
    expect(document.activeElement).toBe(link)
  })

  it("shows a keyboard focus ring and turns the chevron only when motion is allowed", () => {
    render(<Three defaultOpen="dates" />)
    const button = trigger("Your dates")
    expect(button.className).toContain("focus-visible:outline-2")
    expect(button.className).toContain("focus-visible:outline-ring")
    const chevron = button.querySelector("svg")
    expect(chevron?.getAttribute("aria-hidden")).toBe("true")
    expect(chevron?.getAttribute("class")).toContain("rotate-180")
    expect(chevron?.getAttribute("class")).toContain("motion-safe:transition-transform")
    expect(trigger("Rewards").querySelector("svg")?.getAttribute("class")).not.toContain("rotate-180")
  })

  it("adds a section's sensitive class to the whole section", () => {
    render(<Three defaultOpen="fees" />)
    expect(trigger("Fees and rates").closest("section")?.className).toContain("ph-sensitive")
    expect(trigger("Rewards").closest("section")?.className).not.toContain("ph-sensitive")
  })
})
