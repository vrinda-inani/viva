"use client";

import { ActiveSessionShell } from "@/components/viva/ActiveSessionShell";
import { CompletionShell } from "@/components/viva/CompletionShell";
import { LobbyShell } from "@/components/viva/LobbyShell";
import { ProcessingShell } from "@/components/viva/ProcessingShell";
import { useSession } from "@/context/SessionContext";

export default function Home() {
  const { sessionStatus } = useSession();

  return (
    <div className="relative flex min-h-screen flex-col">
      {sessionStatus === "lobby" || sessionStatus === "processing" ? (
        <LobbyShell />
      ) : null}
      {sessionStatus === "processing" ? <ProcessingShell /> : null}
      {sessionStatus === "active" ? <ActiveSessionShell /> : null}
      {sessionStatus === "complete" ? <CompletionShell /> : null}
    </div>
  );
}
