import { useEffect, useRef, useState, useCallback } from "react";
import { useRobotContext } from "../context/RobotContext";

type RefreshRate = "1hz" | "2hz" | "live";

const RATE_DELAYS: Record<RefreshRate, number> = {
  "1hz": 1000,
  "2hz": 500,
  "live": 0,
};

const RATE_LABELS: Record<RefreshRate, string> = {
  "1hz": "1 Hz",
  "2hz": "2 Hz",
  "live": "Live",
};

export function CameraStream() {
  const { clients } = useRobotContext();
  const imgRef = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<RefreshRate>("2hz");

  const fetchFrame = useCallback(async () => {
    if (!clients) return null;
    const resp = await clients.camera.getImages();
    const frame = resp.images[0];
    if (!frame) return null;
    const blob = new Blob([frame.image], { type: frame.mimeType });
    return URL.createObjectURL(blob);
  }, [clients]);

  useEffect(() => {
    if (!clients) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const poll = async () => {
      while (!cancelled) {
        try {
          const url = await fetchFrame();
          if (cancelled) {
            if (url) URL.revokeObjectURL(url);
            break;
          }
          if (url && imgRef.current) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = url;
            imgRef.current.src = url;
            setActive(true);
            setError(null);
          }
        } catch (err) {
          if (cancelled) break;
          setError(err instanceof Error ? err.message : String(err));
          setActive(false);
        }
        const delay = RATE_DELAYS[rate];
        if (delay > 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setActive(false);
    };
  }, [clients, rate, fetchFrame]);

  if (!clients) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-lg">
        <span className="text-gray-500">Connect to robot to see camera</span>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black rounded-lg overflow-hidden">
      <img
        ref={imgRef}
        alt="Camera feed"
        className="w-full h-full object-contain"
      />
      <div className="absolute top-2 right-2 flex gap-1">
        {(Object.keys(RATE_DELAYS) as RefreshRate[]).map((r) => (
          <button
            key={r}
            onClick={() => setRate(r)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              rate === r
                ? "bg-accent text-white"
                : "bg-slate-800/80 text-gray-400 hover:text-white"
            }`}
          >
            {RATE_LABELS[r]}
          </button>
        ))}
      </div>
      {!active && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-gray-400 animate-pulse">Loading camera...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-danger text-sm">Camera error: {error}</span>
        </div>
      )}
    </div>
  );
}
