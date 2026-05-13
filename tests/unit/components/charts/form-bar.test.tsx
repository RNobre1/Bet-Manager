import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormBar } from "@/components/charts/form-bar";

describe("<FormBar />", () => {
  it("renders one cell per result, newest first", () => {
    const { container } = render(<FormBar results={["W", "L", "D", "W", "W"]} />);
    const cells = container.querySelectorAll("[data-result]");
    expect(cells.length).toBe(5);
    // newest-first: first cell is the most recent result
    expect(cells[0].getAttribute("data-result")).toBe("W");
    expect(cells[1].getAttribute("data-result")).toBe("L");
    expect(cells[2].getAttribute("data-result")).toBe("D");
  });

  it("uses distinct color tokens for W, D, L", () => {
    const { container } = render(<FormBar results={["W", "D", "L"]} />);
    const cells = Array.from(container.querySelectorAll("[data-result]")) as HTMLElement[];
    const colors = cells.map((c) => c.style.backgroundColor);
    // each one must be different from the others
    expect(new Set(colors).size).toBe(3);
  });

  it("renders nothing visible (empty container) when results is empty", () => {
    const { container } = render(<FormBar results={[]} />);
    expect(container.querySelectorAll("[data-result]").length).toBe(0);
  });

  it("ignores unknown letters", () => {
    const { container } = render(
      // @ts-expect-error — testing tolerance to bad input
      <FormBar results={["W", "X", "D"]} />,
    );
    const cells = container.querySelectorAll("[data-result]");
    // X is filtered out
    expect(cells.length).toBe(2);
  });

  it("exposes each cell with an a11y label", () => {
    render(<FormBar results={["W", "D", "L"]} />);
    expect(screen.getByLabelText(/W/i)).toBeDefined();
    expect(screen.getByLabelText(/D/i)).toBeDefined();
    expect(screen.getByLabelText(/L/i)).toBeDefined();
  });
});
