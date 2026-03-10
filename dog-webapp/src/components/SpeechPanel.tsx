import { useState } from "react";
import { useRobotContext } from "../context/RobotContext";

export function SpeechPanel() {
  const { clients } = useRobotContext();
  const [text, setText] = useState("");
  const [speaking, setSpeaking] = useState(false);

  const speak = async () => {
    if (!clients || !text.trim() || speaking) return;

    setSpeaking(true);
    try {
      await clients.ttsCoordinator.doCommand({ say_this: text.trim() });
      setText("");
    } catch (err) {
      console.error("TTS failed:", err);
    } finally {
      setSpeaking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      speak();
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Speech</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type something to say..."
          disabled={!clients}
          className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-panel-border rounded focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          onClick={speak}
          disabled={!clients || !text.trim() || speaking}
          className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {speaking ? "..." : "Speak"}
        </button>
      </div>
    </div>
  );
}
