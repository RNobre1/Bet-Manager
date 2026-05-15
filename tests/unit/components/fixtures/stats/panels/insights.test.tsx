import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Insights } from "@/components/fixtures/stats/panels/insights";
import type { Insight } from "@/lib/fixtures/stats/insights";

function corr(over: Partial<Insight & { kind: "correlation" }> = {}): Insight {
  return {
    kind: "correlation",
    statA: "goals_ft_for",
    statB: "sot_for",
    r: 0.73,
    headline: "Gols pró × SOT (+0.73)",
    text: "Correlação positiva forte.",
    confidence: 0.73,
    ...(over as object),
  } as Insight;
}

function trend(over: Partial<Insight & { kind: "trend" }> = {}): Insight {
  return {
    kind: "trend",
    stat: "corners_for",
    slope: 0.5,
    direction: "up",
    headline: "↑ Tendência em escanteios",
    text: "Slope +0.5/jogo.",
    confidence: 0.6,
    ...(over as object),
  } as Insight;
}

function pattern(over: Partial<Insight & { kind: "pattern" }> = {}): Insight {
  return {
    kind: "pattern",
    code: "btts_high_bp",
    headline: "BTTS forte + árbitro de cartão",
    text: "Streak BTTS combinado com BP do árbitro.",
    confidence: 0.85,
    ...(over as object),
  } as Insight;
}

function outlier(over: Partial<Insight & { kind: "outlier" }> = {}): Insight {
  return {
    kind: "outlier",
    stat: "goals_ft_for",
    matchId: 99,
    value: 6,
    zScore: 2.4,
    headline: "↑ Gols pró: 6 (z=2.4)",
    text: "Valor de 6 desvia da média.",
    confidence: 0.6,
    ...(over as object),
  } as Insight;
}

describe("<Insights />", () => {
  it("renders null when array is empty", () => {
    const { container } = render(<Insights insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one card per insight, preserving input order", () => {
    const items = [corr(), trend(), pattern(), outlier()];
    const { container } = render(<Insights insights={items} />);
    const cards = container.querySelectorAll("[data-insight]");
    expect(cards.length).toBe(4);
    expect(cards[0].getAttribute("data-kind")).toBe("correlation");
    expect(cards[1].getAttribute("data-kind")).toBe("trend");
    expect(cards[2].getAttribute("data-kind")).toBe("pattern");
    expect(cards[3].getAttribute("data-kind")).toBe("outlier");
  });

  it("renders headline and text of each insight", () => {
    render(<Insights insights={[corr()]} />);
    expect(screen.getByText("Gols pró × SOT (+0.73)")).toBeDefined();
    expect(screen.getByText("Correlação positiva forte.")).toBeDefined();
  });

  it("renders 6 cards when given 6 insights", () => {
    const six = [corr(), trend(), pattern(), outlier(), corr({ headline: "B" } as Partial<Insight & { kind: "correlation" }>), trend({ headline: "C" } as Partial<Insight & { kind: "trend" }>)];
    const { container } = render(<Insights insights={six} />);
    expect(container.querySelectorAll("[data-insight]").length).toBe(6);
  });

  it("renders a word-label per kind (no glyph)", () => {
    const items = [corr(), trend(), pattern(), outlier()];
    const { container } = render(<Insights insights={items} />);
    const labels = Array.from(
      container.querySelectorAll("[data-insight-label]"),
    ) as HTMLElement[];
    expect(labels.map((l) => l.textContent)).toEqual([
      "CORRELAÇÃO",
      "TENDÊNCIA",
      "PADRÃO",
      "OUTLIER",
    ]);
    // glyph element removed
    expect(container.querySelector("[data-insight-icon]")).toBeNull();
  });

  it("colors the label per kind", () => {
    const items = [corr(), outlier()];
    const { container } = render(<Insights insights={items} />);
    const labels = Array.from(
      container.querySelectorAll("[data-insight-label]"),
    ) as HTMLElement[];
    expect(labels[0].style.color).not.toBe("");
    expect(labels[0].style.color).not.toBe(labels[1].style.color);
  });
});
