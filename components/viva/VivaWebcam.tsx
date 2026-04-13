"use client";

import Webcam from "react-webcam";

type VivaWebcamProps = {
  className?: string;
  /** Zoom-style self-view mirroring */
  mirrored?: boolean;
};

export default function VivaWebcam({
  className = "h-full w-full min-h-[200px] object-cover",
  mirrored = true,
}: VivaWebcamProps) {
  return (
    <Webcam
      audio={false}
      mirrored={mirrored}
      screenshotFormat="image/jpeg"
      videoConstraints={{
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }}
      className={className}
    />
  );
}
