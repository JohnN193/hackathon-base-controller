import { useEffect, useState, useRef } from "react";
import { useRobotContext } from "../context/RobotContext";
import { COMPONENTS } from "../lib/robot-config";

interface Classification {
  className: string;
  confidence: number;
}

export function VisionPanel() {
  const { clients } = useRobotContext();
  const [faces, setFaces] = useState<Classification[]>([]);
  const [waveDetected, setWaveDetected] = useState(false);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [personName, setPersonName] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);
  const [addPersonResult, setAddPersonResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!clients) {
      setFaces([]);
      setWaveDetected(false);
      return;
    }

    setPolling(true);

    const poll = async () => {
      try {
        const faceDetections = await clients.faceVision.getDetectionsFromCamera(COMPONENTS.CAMERA);
        setFaces(
          faceDetections.map((d) => ({
            className: d.className ?? "unknown",
            confidence: d.confidence ?? 0,
          }))
        );
      } catch {
        // Vision service may not always respond
      }

      try {
        const gestureDetections = await clients.gestureVision.getDetectionsFromCamera(COMPONENTS.CAMERA);
        setWaveDetected(gestureDetections.some((d) => d.confidence && d.confidence > 0.5));
      } catch {
        // Gesture service may not always respond
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPolling(false);
    };
  }, [clients]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Vision</h2>

      {/* Faces */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">Faces</h3>
        {faces.length === 0 ? (
          <p className="text-xs text-gray-600">
            {clients ? "No faces detected" : "Not connected"}
          </p>
        ) : (
          <ul className="space-y-1">
            {faces.map((face, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{face.className}</span>
                <span className="text-xs text-gray-500">
                  {(face.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Gesture */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">Gesture</h3>
        <p className={`text-sm ${waveDetected ? "text-success" : "text-gray-600"}`}>
          {waveDetected ? "Wave detected" : "No wave"}
        </p>
      </div>

      {/* Add Person */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">Add Person</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && personName.trim() && clients && !addingPerson) {
                e.preventDefault();
                setAddPersonResult(null);
                setAddingPerson(true);
                try {
                  const resp = await clients.faceVision.doCommand({ "add_person": personName.trim() });
                  setAddPersonResult({ ok: true, message: resp.result as string ?? JSON.stringify(resp) });
                } catch (err) {
                  setAddPersonResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
                } finally {
                  setAddingPerson(false);
                }
              }
            }}
            placeholder="Person name..."
            disabled={!clients}
            className="flex-1 px-2 py-1 text-sm bg-slate-800 border border-panel-border rounded focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={async () => {
              if (!clients || !personName.trim() || addingPerson) return;
              setAddPersonResult(null);
              setAddingPerson(true);
              try {
                const resp = await clients.faceVision.doCommand({ "add_person": personName.trim() });
                setAddPersonResult({ ok: true, message: resp.result as string ?? JSON.stringify(resp) });
              } catch (err) {
                setAddPersonResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
              } finally {
                setAddingPerson(false);
              }
            }}
            disabled={!clients || !personName.trim() || addingPerson}
            className="px-3 py-1 text-sm bg-accent hover:bg-accent-hover rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingPerson ? "..." : "Add"}
          </button>
        </div>
        {addPersonResult && (
          <p className={`text-xs mt-1 ${addPersonResult.ok ? "text-success" : "text-red-400"}`}>
            {addPersonResult.message}
          </p>
        )}
      </div>

      {/* Recompute Embeddings */}
      <div>
        <button
          onClick={async () => {
            if (!clients || recomputing) return;
            setRecomputeResult(null);
            setRecomputing(true);
            try {
              const resp = await clients.faceVision.doCommand({ "recompute_embeddings": "" });
              setRecomputeResult({ ok: true, message: resp.result as string ?? JSON.stringify(resp) });
            } catch (err) {
              setRecomputeResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
            } finally {
              setRecomputing(false);
            }
          }}
          disabled={!clients || recomputing}
          className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
        >
          {recomputing ? "Recomputing..." : "Recompute Embeddings"}
        </button>
        {recomputeResult && (
          <p className={`text-xs mt-1 ${recomputeResult.ok ? "text-success" : "text-red-400"}`}>
            {recomputeResult.message}
          </p>
        )}
      </div>

      {polling && (
        <p className="text-[10px] text-gray-700">Polling every 2s</p>
      )}
    </div>
  );
}
