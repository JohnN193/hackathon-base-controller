import { useGamepad } from "../hooks/useGamepad";
import { useRobotContext } from "../context/RobotContext";

export function GamepadStatus() {
  const { clients } = useRobotContext();
  const gamepad = useGamepad(clients);

  if (!gamepad.connected) {
    return (
      <span className="text-xs text-gray-600">No gamepad</span>
    );
  }

  return (
    <span className="text-xs text-success">
      Gamepad: {gamepad.name.split("(")[0].trim() || "Connected"}
    </span>
  );
}
