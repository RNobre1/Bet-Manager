import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { RichTooltipCard } from "@/components/fixtures/stats/_primitives/rich-tooltip";

describe("RichTooltipCard", () => {
  it("renders title, formatted rows, reading", () => {
    render(
      <RichTooltipCard
        title="M. Salah · Liverpool"
        rows={[
          { k: "Minutos", v: "2.480" },
          { k: "G+A /90", v: "0.51" },
        ]}
        reading="Alto volume + decisivo."
      />,
    );
    expect(screen.getByText("M. Salah · Liverpool")).toBeInTheDocument();
    expect(screen.getByText("2.480")).toBeInTheDocument();
    expect(screen.getByText("Alto volume + decisivo.")).toBeInTheDocument();
  });
});
