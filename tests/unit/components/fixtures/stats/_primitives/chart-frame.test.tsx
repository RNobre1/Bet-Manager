import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { ChartFrame } from "@/components/fixtures/stats/_primitives/chart-frame";

describe("ChartFrame", () => {
  it("renders Y ticks, X labels and a labeled reference line", () => {
    render(
      <ChartFrame
        yTicks={[0, 2, 4]}
        xLabels={["NEW", "FUL", "BRI"]}
        referenceLines={[
          { value: 1.8, label: "média 1.8", color: "var(--color-ink-faint)" },
        ]}
        height={160}
      >
        <div data-testid="chart-body" />
      </ChartFrame>,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("NEW")).toBeInTheDocument();
    expect(screen.getByText("média 1.8")).toBeInTheDocument();
    expect(screen.getByTestId("chart-body")).toBeInTheDocument();
  });
});
