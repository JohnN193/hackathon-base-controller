import { createContext, useContext, type ReactNode } from "react";
import { useRobot, type RobotClients, type ConnectionStatus } from "../hooks/useRobot";

interface RobotContextValue {
  status: ConnectionStatus;
  clients: RobotClients | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const RobotContext = createContext<RobotContextValue | null>(null);

export function RobotProvider({ children }: { children: ReactNode }) {
  const robot = useRobot();
  return <RobotContext.Provider value={robot}>{children}</RobotContext.Provider>;
}

export function useRobotContext(): RobotContextValue {
  const ctx = useContext(RobotContext);
  if (!ctx) throw new Error("useRobotContext must be used within RobotProvider");
  return ctx;
}
