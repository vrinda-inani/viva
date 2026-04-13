"use client";

import dynamic from "next/dynamic";

const VivaWebcam = dynamic(() => import("@/components/viva/VivaWebcam"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center text-xs text-viva-grey-mid">
      Camera…
    </div>
  ),
});

export function LobbyWebcamPreview() {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
      <VivaWebcam className="h-full w-full min-h-[220px] object-cover" />
    </div>
  );
}
