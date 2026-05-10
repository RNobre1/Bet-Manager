"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ITEMS: Array<{
  group: string;
  label: string;
  hint?: string;
  href: string;
  keywords: string[];
}> = [
  { group: "ir para", label: "visão geral", href: "/", keywords: ["overview", "dashboard", "home"] },
  { group: "ir para", label: "casas", href: "/houses", keywords: ["houses", "books"] },
  { group: "ir para", label: "apostas", href: "/bets", keywords: ["bets", "wagers"] },
  { group: "ir para", label: "transações", href: "/transactions", keywords: ["transactions", "ledger"] },
  { group: "ir para", label: "previsão", href: "/forecast", keywords: ["forecast", "projection"] },
  { group: "ir para", label: "explorar", href: "/explore", keywords: ["explore", "sql", "duckdb"] },
  { group: "ir para", label: "auditoria", href: "/audit", keywords: ["audit", "history"] },
  { group: "ações", label: "+ aposta", hint: "nova aposta", href: "/bets/new", keywords: ["new bet"] },
  { group: "ações", label: "+ transação", hint: "novo lançamento", href: "/transactions/new", keywords: ["new transaction"] },
  { group: "ações", label: "+ casa", hint: "cadastrar casa", href: "/houses/new", keywords: ["new house"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="paleta de comandos"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[color-mix(in_srgb,var(--color-void)_70%,transparent)] px-4 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-[var(--color-line-strong)] bg-[var(--color-surface-1)] shadow-2xl"
      >
        <Command label="paleta de comandos" className="flex flex-col">
          <Command.Input
            autoFocus
            placeholder="ir para… ou criar…"
            className="h-12 w-full border-b border-[var(--color-line-subtle)] bg-transparent px-4 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-xs text-[var(--color-ink-muted)]">
              nada por aqui.
            </Command.Empty>
            {Array.from(new Set(ITEMS.map((i) => i.group))).map((group) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-[var(--color-ink-faint)]"
              >
                {ITEMS.filter((i) => i.group === group).map((i) => (
                  <Command.Item
                    key={i.href}
                    value={`${i.label} ${i.keywords.join(" ")}`}
                    onSelect={() => go(i.href)}
                    className="flex cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-ink)] aria-selected:bg-[var(--color-surface-2)]"
                  >
                    <span>{i.label}</span>
                    {i.hint && (
                      <span className="num text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                        {i.hint}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
          <div className="flex items-center justify-between border-t border-[var(--color-line-subtle)] px-3 py-2 text-[10px] text-[var(--color-ink-faint)]">
            <span className="num">↵ ir · esc fechar</span>
            <span className="num">⌘K</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
