import { MissionCanvasView } from "./MissionCanvasView";

export const dynamic = "force-dynamic";

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MissionCanvasView missionId={id} />;
}
