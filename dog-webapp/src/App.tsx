import { StatusBar } from "./components/StatusBar";
import { CameraStream } from "./components/CameraStream";
import { MovementControl } from "./components/MovementControl";
import { TrickButtons } from "./components/TrickButtons";
import { SpeechPanel } from "./components/SpeechPanel";
import { VisionPanel } from "./components/VisionPanel";
import { GamepadStatus } from "./components/GamepadStatus";
import { useRobotContext } from "./context/RobotContext";

function App() {
  const { status } = useRobotContext();

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Status bar */}
      <StatusBar />

      {status !== "connected" ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">
            {status === "connecting" ? "Connecting to robot..." : "Click Connect to start"}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main content area */}
          <div className="flex-1 grid grid-cols-[240px_1fr_300px] gap-px bg-panel-border min-h-0">
            {/* Left sidebar: Movement + Tricks */}
            <div className="bg-panel overflow-y-auto">
              <MovementControl />
              <div className="border-t border-panel-border" />
              <TrickButtons />
            </div>

            {/* Center: Camera */}
            <div className="bg-panel p-2 min-h-0">
              <CameraStream />
            </div>

            {/* Right sidebar: Vision */}
            <div className="bg-panel overflow-y-auto">
              <VisionPanel />
            </div>
          </div>

          {/* Bottom bar: Speech + Gamepad status */}
          <div className="grid grid-cols-[240px_1fr] gap-px bg-panel-border">
            <div className="bg-panel p-3 flex items-center">
              <GamepadStatus />
            </div>
            <div className="bg-panel">
              <SpeechPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
