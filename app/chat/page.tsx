import Link from "next/link";
import { Logo } from "@/components/landing/Icons";
import ChatPanel from "@/components/chat/ChatPanel";
import SignOutButton from "@/components/auth/SignOutButton";

export const metadata = {
  title: "Chat — OPTIMUS",
};

export default function ChatPage() {
  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-line bg-white/85 px-6 backdrop-blur-md">
        <Link href="/" aria-label="OPTIMUS home">
          <Logo />
        </Link>
        <div className="ml-auto">
          <SignOutButton />
        </div>
      </header>
      <main>
        <ChatPanel />
      </main>
    </>
  );
}
