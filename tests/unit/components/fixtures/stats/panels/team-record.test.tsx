import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamRecord } from "@/components/fixtures/stats/panels/team-record";
import type { TeamRecordDerived } from "@/lib/fixtures/stats/detail-json-types";

function split(over: Partial<TeamRecordDerived["split"]> = {}): TeamRecordDerived["split"] {
  return {
    type: "Home",
    played: 18,
    won: 12,
    draw: 3,
    lost: 3,
    goals_for: 30,
    goals_against: 15,
    goal_diff: 15,
    points: 39,
    points_per_game: 2.17,
    position: 4,
    form: ["W", "W", "D", "L", "W"], // newest-first
    ...over,
  };
}

function record(over: Partial<TeamRecordDerived> = {}): TeamRecordDerived {
  return {
    split: split(),
    overall: split({ type: "All", played: 36, won: 20, points: 65, points_per_game: 1.81, position: 4 }),
    ...over,
  };
}

describe("<TeamRecord />", () => {
  it("renders the team name and points", () => {
    render(<TeamRecord teamName="Flamengo" data={record()} />);
    expect(screen.getByText("Flamengo")).toBeDefined();
    // split.points shown
    expect(screen.getByText("39")).toBeDefined();
  });

  it("renders PPG with two decimal digits", () => {
    render(<TeamRecord teamName="Flamengo" data={record()} />);
    expect(screen.getByText("2.17")).toBeDefined();
  });

  it("renders the parsed position", () => {
    render(<TeamRecord teamName="Flamengo" data={record()} />);
    expect(screen.getByText(/4/)).toBeDefined();
  });

  it("renders the goal diff with sign", () => {
    render(<TeamRecord teamName="Flamengo" data={record()} />);
    expect(screen.getByText("+15")).toBeDefined();
  });

  it("shows the form bar with the newest result first", () => {
    const { container } = render(<TeamRecord teamName="Flamengo" data={record()} />);
    const cells = container.querySelectorAll("[data-result]");
    expect(cells.length).toBe(5);
    expect(cells[0].getAttribute("data-result")).toBe("W");
  });

  it("renders null when data is null", () => {
    const { container } = render(<TeamRecord teamName="Flamengo" data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("hides splits comparison when overall and split are identical", () => {
    const rec: TeamRecordDerived = {
      split: split(),
      overall: split(), // identical
    };
    const { container } = render(<TeamRecord teamName="Flamengo" data={rec} />);
    expect(container.querySelector("[data-splits-comparison]")).toBeNull();
  });
});
