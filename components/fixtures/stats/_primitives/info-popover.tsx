"use client";
import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
}

export function InfoPopover({ label, children }: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--color-ink-faint)] text-[9px] font-semibold text-[var(--color-ink-muted)] hover:border-[var(--color-vermelho)]"
      >
        i
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-md border border-[var(--color-surface-3)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-ink-muted)] shadow-xl"
        >
          {children}
          <Popover.Arrow className="fill-[var(--color-surface-2)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
