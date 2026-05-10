import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlaceBetForm } from "./form";

export default async function NewBetPage() {
  const supabase = await createClient();
  const { data: houses } = await supabase
    .from("houses")
    .select("id, name")
    .is("archived_at", null)
    .order("name");

  if (!houses || houses.length === 0) {
    redirect("/houses/new");
  }

  const nowLocal = new Date();
  nowLocal.setMinutes(nowLocal.getMinutes() - nowLocal.getTimezoneOffset());
  const defaultIso = nowLocal.toISOString().slice(0, 16);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 lg:px-12 lg:py-16">
      <header className="mb-10">
        <span className="label">apostas / nova</span>
        <h2 className="mt-2">nova aposta</h2>
      </header>

      <PlaceBetForm
        houses={houses.map((h) => ({ id: h.id, name: h.name }))}
        defaultPlacedAt={defaultIso}
      />
    </main>
  );
}
