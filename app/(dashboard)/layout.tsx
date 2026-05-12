import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/login/actions";
import { CommandPalette } from "@/components/command-palette";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

const NAV = [
  { href: "/", label: "overview" },
  { href: "/houses", label: "casas" },
  { href: "/bets", label: "apostas" },
  { href: "/transactions", label: "transações" },
  { href: "/forecast", label: "previsão" },
  { href: "/fixtures", label: "fixtures" },
  { href: "/explore", label: "explorar" },
  { href: "/audit", label: "auditoria" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const display =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "you";

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] lg:flex lg:w-64 lg:flex-col lg:px-6 lg:py-8">
        <Link href="/" className="block">
          <span className="label">abissal</span>
          <p
            className="mt-2 font-[var(--font-display)] text-2xl italic leading-none"
            style={{ color: "var(--color-vermelho)" }}
          >
            habitada
          </p>
        </Link>

        <nav className="mt-12 flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex items-center justify-between border-t border-[var(--color-line-subtle)] pt-4">
          <span className="num text-xs text-[var(--color-ink-muted)]">
            {display}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="label hover:text-[var(--color-vermelho)]"
            >
              sair
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col pb-20 lg:pb-0">{children}</div>

      <CommandPalette />

      <MobileBottomNav />
    </div>
  );
}
