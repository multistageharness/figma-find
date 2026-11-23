import { describe, expect, it } from "vitest";
import { FIGMA_FIND_VERSION } from "./index.js";

describe("package smoke", () => {
  it("exports a version", () => {
    expect(FIGMA_FIND_VERSION).toBe("0.1.0");
  });
});
