import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import {
  TeamLegend,
  teamColor,
} from "@/components/fixtures/stats/_primitives/team-legend";

describe("TeamLegend", () => {
  it("renders both team names with swatches", () => {
    render(<TeamLegend home="Aston Villa" away="Liverpool" />);
    expect(screen.getByText("Aston Villa")).toBeInTheDocument();
    expect(screen.getByText("Liverpool")).toBeInTheDocument();
  });
  it("teamColor maps side to token", () => {
    expect(teamColor("home")).toBe("var(--color-vermelho)");
    expect(teamColor("away")).toBe("var(--color-depth)");
  });
});
