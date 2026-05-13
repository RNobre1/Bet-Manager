import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TimeSeriesLine } from "@/components/charts/time-series-line";

describe("<TimeSeriesLine />", () => {
  it("renders one path per series", () => {
    const data = [
      { x: "M1", a: 1, b: 2 },
      { x: "M2", a: 2, b: 3 },
      { x: "M3", a: 3, b: 1 },
    ];
    const { container } = render(
      <TimeSeriesLine
        data={data}
        xKey="x"
        series={[
          { key: "a", label: "A", color: "#c42b2b" },
          { key: "b", label: "B", color: "#1a5fad" },
        ]}
        width={400}
        height={200}
      />,
    );
    // recharts <Line> renders an SVG <path class="recharts-curve recharts-line-curve">
    const paths = container.querySelectorAll("path.recharts-line-curve");
    expect(paths.length).toBe(2);
  });

  it("renders empty fallback when data is empty", () => {
    const { getByText } = render(
      <TimeSeriesLine
        data={[]}
        xKey="x"
        series={[{ key: "a", label: "A", color: "#c42b2b" }]}
        width={400}
        height={200}
      />,
    );
    expect(getByText(/sem dados/i)).toBeDefined();
  });
});
