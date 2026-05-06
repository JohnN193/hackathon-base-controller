import { useState, useCallback, useEffect, useRef } from "react";
import { useRobotContext } from "../context/RobotContext";
import { MOVEMENT } from "../lib/robot-config";

const POSE_STEP_DEG = 15;

type Direction = "up" | "down" | "left" | "right";

export function MovementControl() {
  const { clients } = useRobotContext();
  const [maxLinear, setMaxLinear] = useState<number>(MOVEMENT.DEFAULT_LINEAR_MM_PER_SEC);
  const [maxAngular, setMaxAngular] = useState<number>(MOVEMENT.DEFAULT_ANGULAR_DEG_PER_SEC);
  const [activeKeys, setActiveKeys] = useState<Set<Direction>>(new Set());
  const activeRef = useRef<Set<Direction>>(new Set());
  const [strafeMode, setStrafeMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const effectiveStrafeMode = strafeMode !== shiftHeld; // XOR: shift toggles the base mode
  const effectiveStrafeModeRef = useRef(effectiveStrafeMode);
  effectiveStrafeModeRef.current = effectiveStrafeMode;

  const addDirection = useCallback((dir: Direction) => {
    activeRef.current.add(dir);
    setActiveKeys(new Set(activeRef.current));
  }, []);

  const removeDirection = useCallback((dir: Direction) => {
    activeRef.current.delete(dir);
    setActiveKeys(new Set(activeRef.current));
  }, []);

  // Keyboard listeners
  useEffect(() => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") { setShiftHeld(true); return; }
      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        addDirection(dir);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") { setShiftHeld(false); return; }
      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        removeDirection(dir);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [addDirection, removeDirection]);

  // Send velocity commands at a fixed rate
  useEffect(() => {
    if (!clients) return;

    let wasStopped = true;

    const id = setInterval(async () => {
      const keys = activeRef.current;
      const forward = keys.has("up") ? 1 : keys.has("down") ? -1 : 0;
      const lateral = keys.has("left") ? 1 : keys.has("right") ? -1 : 0;
      const isStrafe = effectiveStrafeModeRef.current;

      try {
        if (forward === 0 && lateral === 0) {
          if (!wasStopped) {
            await clients.base.stop();
            wasStopped = true;
          }
        } else {
          wasStopped = false;
          await clients.base.setVelocity(
            { x: isStrafe ? lateral * maxLinear : 0, y: forward * maxLinear, z: 0 },
            { x: 0, y: 0, z: isStrafe ? 0 : lateral * maxAngular }
          );
        }
      } catch {
        // ignore transient errors
      }
    }, 100);

    return () => clearInterval(id);
  }, [clients, maxLinear, maxAngular]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      clients?.base.stop().catch(() => {});
    };
  }, [clients]);

  const buttons: { dir: Direction; label: string; gridArea: string }[] = [
    { dir: "up", label: "\u2191", gridArea: "1 / 2" },
    { dir: "left", label: "\u2190", gridArea: "2 / 1" },
    { dir: "down", label: "\u2193", gridArea: "2 / 2" },
    { dir: "right", label: "\u2192", gridArea: "2 / 3" },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Movement</h2>

      {/* Strafe/Turn toggle */}
      <div className="flex items-center gap-1 self-center">
        <button
          onClick={() => setStrafeMode(false)}
          className={`px-3 py-1 text-xs rounded-l transition-colors ${!strafeMode ? "bg-accent text-white" : "bg-slate-700 text-gray-400 hover:bg-slate-600"}`}
        >
          Turn
        </button>
        <button
          onClick={() => setStrafeMode(true)}
          className={`px-3 py-1 text-xs rounded-r transition-colors ${strafeMode ? "bg-accent text-white" : "bg-slate-700 text-gray-400 hover:bg-slate-600"}`}
        >
          Strafe
        </button>
        {shiftHeld && <span className="text-xs text-gray-500 ml-1">(shift)</span>}
      </div>

      {/* Arrow buttons */}
      <div className="grid grid-cols-3 grid-rows-2 gap-1 w-36 mx-auto">
        {buttons.map(({ dir, label, gridArea }) => (
          <button
            key={dir}
            onPointerDown={() => addDirection(dir)}
            onPointerUp={() => removeDirection(dir)}
            onPointerLeave={() => removeDirection(dir)}
            disabled={!clients}
            style={{ gridArea }}
            className={`w-11 h-11 text-lg rounded transition-colors select-none touch-none ${
              activeKeys.has(dir)
                ? "bg-accent text-white"
                : "bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Pose control */}
      <div>
        <h3 className="text-xs text-gray-500 mb-2">Pose</h3>
        <div className="flex flex-col gap-1">
          {(["pitch", "roll", "yaw"] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8 capitalize">{axis}</span>
              <button
                onClick={() => clients?.base.doCommand({ pose_delta: { roll_deg: axis === "roll" ? -POSE_STEP_DEG : 0, pitch_deg: axis === "pitch" ? -POSE_STEP_DEG : 0, yaw_deg: axis === "yaw" ? -POSE_STEP_DEG : 0 } })}
                disabled={!clients}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >−</button>
              <button
                onClick={() => clients?.base.doCommand({ pose_delta: { roll_deg: axis === "roll" ? POSE_STEP_DEG : 0, pitch_deg: axis === "pitch" ? POSE_STEP_DEG : 0, yaw_deg: axis === "yaw" ? POSE_STEP_DEG : 0 } })}
                disabled={!clients}
                className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >+</button>
            </div>
          ))}
        </div>
      </div>

      {/* Speed sliders */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">
          Linear: {maxLinear} mm/s
        </span>
        <input
          type="range"
          min={100}
          max={MOVEMENT.MAX_LINEAR_MM_PER_SEC}
          step={50}
          value={maxLinear}
          onChange={(e) => setMaxLinear(Number(e.target.value))}
          className="accent-accent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">
          Angular: {maxAngular} deg/s
        </span>
        <input
          type="range"
          min={5}
          max={MOVEMENT.MAX_ANGULAR_DEG_PER_SEC}
          step={5}
          value={maxAngular}
          onChange={(e) => setMaxAngular(Number(e.target.value))}
          className="accent-accent"
        />
      </label>
    </div>
  );
}
