import type { ArtifactStore } from "@/kernel/artifacts";
import type { Evidence } from "@/kernel/types";

/**
 * llm.chat's evidence carries an artifactId pointing at the RAW upstream
 * OmniRoute response (see kernel/capabilities/omniroute/chat.ts's run()) —
 * the Scheduler only preserves Evidence, never a capability's raw return
 * value, so this is how both the create-mission route and the
 * reopen-a-past-mission route recover the actual reply text.
 */
export async function resolveChatContent(
  evidence: Evidence | undefined,
  store: ArtifactStore,
): Promise<string | undefined> {
  const artifactId = evidence?.artifactIds[0];
  if (!artifactId) return undefined;
  try {
    const raw = JSON.parse(await store.get(artifactId)) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return raw.choices?.[0]?.message?.content;
  } catch {
    return undefined;
  }
}
