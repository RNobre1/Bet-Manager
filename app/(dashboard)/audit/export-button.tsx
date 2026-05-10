"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportAuditCsvAction } from "./actions";

export function ExportCsvButton({
  entity,
  action,
}: {
  entity?: string;
  action?: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      if (entity) fd.set("entity", entity);
      if (action) fd.set("action", action);
      const { filename, csv } = await exportAuditCsvAction(fd);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "exportando…" : "↓ csv"}
    </Button>
  );
}
