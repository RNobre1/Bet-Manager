import { redirect } from "next/navigation";

/**
 * Rota legada. O dashboard de stats agora é a tela inicial do jogo em
 * /fixtures/[id]. Mantida só para não quebrar bookmarks/links antigos.
 */
export default async function StatsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/fixtures/${id}`);
}
