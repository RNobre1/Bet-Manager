"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { resolveBetAction } from "../actions";

type Status =
  | "won"
  | "lost"
  | "void"
  | "cashed_out"
  | "half_won"
  | "half_lost"
  | "partially_void";

const NEEDS_RETURN: Record<Status, boolean> = {
  won: false,
  lost: false,
  void: false,
  cashed_out: true,
  half_won: true,
  half_lost: true,
  partially_void: true,
};

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: "won", label: "ganha" },
  { value: "lost", label: "perdida" },
  { value: "void", label: "anulada (refund)" },
  { value: "cashed_out", label: "cash-out" },
  { value: "half_won", label: "meia ganha" },
  { value: "half_lost", label: "meia perdida" },
  { value: "partially_void", label: "parcial anulada" },
];

export function ResolveForm({
  betId,
  expectedReturn,
  totalStake,
}: {
  betId: string;
  expectedReturn: number;
  totalStake: number;
}) {
  const [status, setStatus] = useState<Status>("won");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsReturn = NEEDS_RETURN[status];

  const placeholder =
    status === "won"
      ? `padrão: ${expectedReturn.toFixed(2).replace(".", ",")}`
      : status === "void"
        ? `padrão: ${totalStake.toFixed(2).replace(".", ",")}`
        : status === "lost"
          ? "padrão: 0,00"
          : "0,00";

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          try {
            await resolveBetAction(fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "erro ao resolver");
          }
        })
      }
      className="card flex flex-col gap-5 p-6"
    >
      <input type="hidden" name="bet_id" value={betId} />

      <Field label="resolver como" htmlFor="status">
        <Select
          id="status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          required
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={
          needsReturn
            ? "retorno realizado (BRL)"
            : "retorno realizado (opcional, BRL)"
        }
        htmlFor="actual_return"
        hint={
          needsReturn
            ? "Quanto a casa devolveu de fato — incluindo o stake."
            : "Deixe vazio para usar o padrão do status."
        }
      >
        <Input
          id="actual_return"
          name="actual_return"
          mono
          inputMode="decimal"
          placeholder={placeholder}
          required={needsReturn}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="num text-sm"
          style={{ color: "var(--color-warning)" }}
        >
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "resolvendo…" : "confirmar resolução"}
        </Button>
      </div>
    </form>
  );
}
