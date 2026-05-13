import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Referee } from "@/components/fixtures/stats/panels/referee";
import type { RefereeRecord } from "@/lib/fixtures/stats/detail-json-types";

function ref(over: Partial<RefereeRecord> = {}): RefereeRecord {
  return {
    name: "Anthony Taylor",
    completed: 18,
    fixtures_count: 22,
    avg_total_booking_points: 48.3,
    avg_home_booking_points: 21.5,
    avg_away_booking_points: 26.8,
    total_yellow_reds: 3,
    ...over,
  };
}

describe("<Referee />", () => {
  it("renders null when record is null", () => {
    const { container } = render(<Referee record={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the referee name", () => {
    render(<Referee record={ref()} />);
    expect(screen.getByText("Anthony Taylor")).toBeDefined();
  });

  it("renders the avg total booking points (1 decimal digit)", () => {
    render(<Referee record={ref()} />);
    expect(screen.getByText("48.3")).toBeDefined();
  });

  it("highlights BP when avg > 45 (vermelho token)", () => {
    const { container } = render(<Referee record={ref({ avg_total_booking_points: 50 })} />);
    const big = container.querySelector("[data-bp-headline]") as HTMLElement | null;
    expect(big).not.toBeNull();
    expect(big?.style.color).toContain("color-vermelho");
  });

  it("does NOT highlight BP when avg <= 45", () => {
    const { container } = render(<Referee record={ref({ avg_total_booking_points: 40 })} />);
    const big = container.querySelector("[data-bp-headline]") as HTMLElement | null;
    expect(big).not.toBeNull();
    expect(big?.style.color).not.toContain("color-vermelho");
  });

  it("renders home/away BP splits and total yellow-reds", () => {
    render(<Referee record={ref()} />);
    expect(screen.getByText("21.5")).toBeDefined();
    expect(screen.getByText("26.8")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });
});
