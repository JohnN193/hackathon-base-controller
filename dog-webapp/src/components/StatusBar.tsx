import { useRobotContext } from "../context/RobotContext";

export function StatusBar() {
  const { status, error, connect, disconnect } = useRobotContext();

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-panel border-b border-panel-border">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">Dog Webapp</h1>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              status === "connected"
                ? "bg-success"
                : status === "connecting"
                  ? "bg-warning animate-pulse"
                  : status === "error"
                    ? "bg-danger"
                    : "bg-gray-500"
            }`}
          />
          <span className="text-sm text-gray-400 capitalize">{status}</span>
        </div>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
      <div>
        {status === "disconnected" || status === "error" ? (
          <button
            onClick={connect}
            className="px-3 py-1 text-sm bg-accent hover:bg-accent-hover rounded transition-colors"
          >
            Connect
          </button>
        ) : status === "connected" ? (
          <button
            onClick={disconnect}
            className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-500 rounded transition-colors"
          >
            Disconnect
          </button>
        ) : null}
      </div>
    </header>
  );
}
