import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Removes whatever a component test rendered, so tests cannot see each other's output.
afterEach(() => {
  cleanup();
});
