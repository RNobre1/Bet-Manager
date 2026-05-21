import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

describe("MobileBottomNav", () => {
  it("renderiza 5 elementos (4 links + 1 botão 'mais')", () => {
    const { container } = render(<MobileBottomNav />);
    const nav = container.querySelector(
      'nav[aria-label="Navegação principal"]',
    );
    expect(nav).not.toBeNull();
    // 4 Links + 1 button = 5 children
    expect(nav!.children.length).toBe(5);
    expect(container.querySelector("[data-nav-more]")).not.toBeNull();
  });
});
