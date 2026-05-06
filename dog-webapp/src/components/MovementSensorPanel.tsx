import { useEffect, useState } from "react";
import { useRobotContext } from "../context/RobotContext";

interface OrientationData {
  oX: number;
  oY: number;
  oZ: number;
  theta: number;
}

interface AccelData {
  x: number;
  y: number;
  z: number;
}

interface PositionData {
  x: number;
  y: number;
  z: number;
}

export function MovementSensorPanel() {
  const { clients } = useRobotContext();
  const [expanded, setExpanded] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [orientation, setOrientation] = useState<OrientationData | null>(null);
  const [accel, setAccel] = useState<AccelData | null>(null);
  const [position, setPosition] = useState<PositionData | null>(null);
  const [linearVel, setLinearVel] = useState<{ x: number; y: number; z: number } | null>(null);
  const [angularVel, setAngularVel] = useState<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    if (!clients) {
      setOrientation(null);
      setAccel(null);
      setPosition(null);
      setLinearVel(null);
      setAngularVel(null);
      setHasData(false);
      return;
    }

    const poll = async () => {
      try {
        const o = await clients.movementSensor.getOrientation();
        if (o.oX != null && o.oY != null && o.oZ != null && o.theta != null) {
          setOrientation({ oX: o.oX, oY: o.oY, oZ: o.oZ, theta: o.theta });
          setHasData(true);
        }
      } catch {
        // sensor may not support orientation
      }

      try {
        const a = await clients.movementSensor.getLinearAcceleration();
        if (a.x != null && a.y != null && a.z != null) {
          setAccel({ x: a.x, y: a.y, z: a.z });
        }
      } catch {
        // sensor may not support linear acceleration
      }

      try {
        const lv = await clients.movementSensor.getLinearVelocity();
        setLinearVel({ x: lv.x, y: lv.y, z: lv.z });
      } catch {
        // sensor may not support linear velocity
      }

      try {
        const av = await clients.movementSensor.getAngularVelocity();
        setAngularVel({ x: av.x, y: av.y, z: av.z });
      } catch {
        // sensor may not support angular velocity
      }

      try {
        const p = await clients.movementSensor.getPosition();
        if (p.coordinate) {
          setPosition({ x: p.coordinate.longitude, y: p.coordinate.latitude, z: p.altitudeM });
        }
      } catch {
        // sensor may not support position
      }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [clients]);

  const fmt = (n: number | undefined) => n != null ? n.toFixed(1) : "—";

  if (!hasData) return null;

  return (
    <div className="flex flex-col gap-3 p-3 border-t border-panel-border">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-left"
      >
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Movement Sensor</h2>
        <span className="text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {!expanded && null}
      {expanded && <>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Orientation</h2>
      {orientation ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(["oX", "oY", "oZ", "theta"] as const).map((field) => (
            <div key={field} className="flex flex-col items-center bg-slate-800 rounded p-2">
              <span className="text-xs text-gray-500">{field === "theta" ? "θ" : field}</span>
              <span>{fmt(orientation[field])}{field === "theta" ? "°" : ""}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600">{clients ? "No data" : "Not connected"}</p>
      )}

      {accel && (
        <>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Acceleration</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["x", "y", "z"] as const).map((axis) => (
              <div key={axis} className="flex flex-col items-center bg-slate-800 rounded p-2">
                <span className="text-xs text-gray-500 uppercase">{axis}</span>
                <span>{fmt(accel[axis])}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {linearVel && (
        <>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Linear Velocity</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["x", "y", "z"] as const).map((axis) => (
              <div key={axis} className="flex flex-col items-center bg-slate-800 rounded p-2">
                <span className="text-xs text-gray-500 uppercase">{axis}</span>
                <span>{fmt(linearVel[axis])}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {angularVel && (
        <>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Angular Velocity</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["x", "y", "z"] as const).map((axis) => (
              <div key={axis} className="flex flex-col items-center bg-slate-800 rounded p-2">
                <span className="text-xs text-gray-500 uppercase">{axis}</span>
                <span>{fmt(angularVel[axis])}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {position && (
        <>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Position</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["x", "y", "z"] as const).map((axis) => (
              <div key={axis} className="flex flex-col items-center bg-slate-800 rounded p-2">
                <span className="text-xs text-gray-500 uppercase">{axis}</span>
                <span>{fmt(position[axis])}</span>
              </div>
            ))}
          </div>
        </>
      )}
      </>}
    </div>
  );
}
