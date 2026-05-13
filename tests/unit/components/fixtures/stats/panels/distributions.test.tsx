import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Distributions } from "@/components/fixtures/stats/panels/distributions";
import type {
  BoxStats,
  Distributions as Dist,
} from "@/lib/fixtures/stats/detail-json-types";

function box(over: Partial<BoxStats> = {}): BoxStats {
  return { min: 0, q1: 1, median: 2, q3: 3, max: 5, ...over };
}

function dist(): Dist {
  return {
    goals_ft_for: box(),
    goals_ft_against: box({ max: 4 }),
    corners_for: box({ min: 2, q1: 4, median: 5, q3: 7, max: 10 }),
    corners_against: box({ min: 1, q1: 3, median: 4, q3: 6, max: 9 }),
    cards_for: box({ max: 4 }),
    sot_for: box({ min: 1, q1: 3, median: 4, q3: 6, max: 8 }),
    booking_points_for: box({ min: 10, q1: 20, median: 25, q3: 35, max: 60 }),
  };
}

describe("<Distributions />", () => {
  it("renders a boxplot row per stat key for the home side", () => {
    const { container } = render(<Distributions home={dist()} away={dist()} />);
    const homeBoxes = container.querySelectorAll(
      "[data-side='home'] [data-boxplot]",
    );
    // 7 stat keys in BoxStats output
    expect(homeBoxes.length).toBe(7);
  });

  it("renders a boxplot row per stat key for the away side", () => {
    const { container } = render(<Distributions home={dist()} away={dist()} />);
    const awayBoxes = container.querySelectorAll(
      "[data-side='away'] [data-boxplot]",
    );
    expect(awayBoxes.length).toBe(7);
  });

  it("uses --color-vermelho for home boxplots and --color-depth for away", () => {
    const { container } = render(<Distributions home={dist()} away={dist()} />);
    const homeFirstBox = container.querySelector(
      "[data-side='home'] [data-boxplot] [data-box]",
    ) as HTMLElement;
    const awayFirstBox = container.querySelector(
      "[data-side='away'] [data-boxplot] [data-box]",
    ) as HTMLElement;
    expect(homeFirstBox.style.backgroundColor).toContain("color-vermelho");
    expect(awayFirstBox.style.backgroundColor).toContain("color-depth");
  });

  it("positions median between q1 and q3 (% of full extent)", () => {
    const { container } = render(<Distributions home={dist()} away={dist()} />);
    // pick first boxplot: min=0,q1=1,median=2,q3=3,max=5  → median at 40%
    const boxplot = container.querySelector(
      "[data-side='home'] [data-boxplot]",
    ) as HTMLElement;
    const median = boxplot.querySelector("[data-median]") as HTMLElement;
    expect(median.style.left).toBe("40%");
  });

  it("positions q1 and q3 correctly (width of the inner box)", () => {
    const { container } = render(<Distributions home={dist()} away={dist()} />);
    // min=0,q1=1,q3=3,max=5  → box from 20% to 60% → left=20%, width=40%
    const boxplot = container.querySelector(
      "[data-side='home'] [data-boxplot]",
    ) as HTMLElement;
    const innerBox = boxplot.querySelector("[data-box]") as HTMLElement;
    expect(innerBox.style.left).toBe("20%");
    expect(innerBox.style.width).toBe("40%");
  });

  it("renders zero-range boxplots without crashing", () => {
    const zero = dist();
    zero.goals_ft_for = { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    const { container } = render(<Distributions home={zero} away={dist()} />);
    expect(container.querySelectorAll("[data-side='home'] [data-boxplot]").length).toBe(7);
  });
});
