import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoPopover } from "@/components/fixtures/stats/_primitives/info-popover";

// NOTE: the plan suggested @testing-library/user-event, but it is not
// installed in this repo (no existing test uses it). fireEvent.click from
// @testing-library/react is functionally equivalent for a single trigger
// click and is the repo-native dependency.
describe("InfoPopover", () => {
  it("opens content on trigger click", async () => {
    render(
      <InfoPopover label="como ler">
        <p>conteúdo de ajuda</p>
      </InfoPopover>,
    );
    fireEvent.click(screen.getByRole("button", { name: /como ler/i }));
    expect(await screen.findByText("conteúdo de ajuda")).toBeInTheDocument();
  });
});
