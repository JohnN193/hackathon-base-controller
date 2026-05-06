import { useState, useEffect } from "react";
import type { RobotClients } from "./useRobot";

export function useBattery(clients: RobotClients | null) {
  const [batteryPct, setBatteryPct] = useState<number | null>(null);

  useEffect(() => {
    if (!clients) {
      setBatteryPct(null);
      return;
    }

    const poll = async () => {
      try {
        const readings = await clients.powerSensor.getReadings();
        const soc = readings["soc"];
        if (typeof soc === "number") {
          setBatteryPct(Math.round(soc));
        }
      } catch {
        // sensor unavailable, leave last value
      }
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [clients]);

  return batteryPct;
}
