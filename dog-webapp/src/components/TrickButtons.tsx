import { useState } from "react";
import { useRobotContext } from "../context/RobotContext";
import { TRICKS, type Trick } from "../lib/robot-config";

export function TrickButtons() {
  const { clients } = useRobotContext();
  const [activeTrick, setActiveTrick] = useState<string | null>(null);

  const executeTrick = async (trick: Trick) => {
    if (!clients || activeTrick) return;

    setActiveTrick(trick.id);
    try {
      await clients.base.doCommand(trick.command ?? { [trick.id]: "" });
    } catch (err) {
      console.error(`Trick "${trick.id}" failed:`, err);
    } finally {
      setActiveTrick(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Tricks</h2>
      <div className="grid grid-cols-3 gap-2">
        {TRICKS.map((trick) => (
          <button
            key={trick.id}
            onClick={() => executeTrick(trick)}
            disabled={!clients || activeTrick !== null}
            className={`px-3 py-2 text-sm rounded transition-colors ${
              activeTrick === trick.id
                ? "bg-accent text-white"
                : "bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {trick.label}
          </button>
        ))}
      </div>
    </div>
  );
}
