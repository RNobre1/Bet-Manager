"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  ArrowLeftRight,
  Wallet,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /**
   * Routes that should highlight this tab. We match `pathname === match` for
   * the root, and `pathname.startsWith(match + "/") || pathname === match`
   * for nested routes (so /fixtures/[id] still highlights the fixtures tab).
   */
  match: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "início", Icon: LayoutDashboard, match: "/" },
  { href: "/bets", label: "apostas", Icon: Target, match: "/bets" },
  { href: "/fixtures", label: "fixtures", Icon: CalendarDays, match: "/fixtures" },
  {
    href: "/transactions",
    label: "transações",
    Icon: ArrowLeftRight,
    match: "/transactions",
  },
  { href: "/houses", label: "casas", Icon: Wallet, match: "/houses" },
];

function isActive(pathname: string, match: string): boolean {
  if (match === "/") return pathname === "/";
  return pathname === match || pathname.startsWith(`${match}/`);
}

/**
 * Mobile-only bottom navigation. Five tabs (overview/apostas/fixtures/
 * transações/casas); the desktop sidebar carries the full list. Lucide icons
 * + lowercase labels in the project's "label" type. The active tab is marked
 * with a thin vermelho top-border and tints both the icon and the text.
 *
 * Lives outside the desktop layout via `lg:hidden` and slides up from the
 * bottom; the parent layout already pads `pb-20` so content above doesn't
 * disappear under it.
 */
export function MobileBottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[var(--color-line)] bg-[var(--color-surface-1)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface-1)]/80 lg:hidden"
      aria-label="Navegação principal"
    >
      {ITEMS.map(({ href, label, Icon, match }) => {
        const active = isActive(pathname, match);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative flex flex-col items-center justify-center gap-1 py-3 transition-colors",
              active
                ? "text-[var(--color-vermelho)]"
                : "text-[var(--color-ink-muted)] active:bg-[var(--color-surface-2)]",
            ].join(" ")}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--color-vermelho)]"
              />
            ) : null}
            <Icon size={18} strokeWidth={1.75} aria-hidden />
            <span className="label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
