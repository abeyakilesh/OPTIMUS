import ChatShell from "@/components/chat/ChatShell";
import { AppShell } from "@/components/workspace/AppShell";

export const metadata = { title: "Chat — OPTIMUS" };

export default function ChatPage() {
  return (
    <AppShell>
      <ChatShell />
    </AppShell>
  );
}
