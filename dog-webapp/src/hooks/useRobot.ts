import { useState, useEffect, useCallback, useRef } from "react";
import * as VIAM from "@viamrobotics/sdk";
import { COMPONENTS, SERVICES } from "../lib/robot-config";

export interface RobotClients {
  machine: VIAM.RobotClient;
  base: VIAM.BaseClient;
  camera: VIAM.CameraClient;
  faceVision: VIAM.VisionClient;
  gestureVision: VIAM.VisionClient;
  speaker: VIAM.AudioOutClient;
  webGamepad: VIAM.InputControllerClient;
  powerSensor: VIAM.PowerSensorClient;
  movementSensor: VIAM.MovementSensorClient;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function useRobot() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [clients, setClients] = useState<RobotClients | null>(null);
  const [error, setError] = useState<string | null>(null);
  const machineRef = useRef<VIAM.RobotClient | null>(null);

  const connect = useCallback(async () => {
    const host = import.meta.env.VITE_VIAM_HOST;
    const apiKey = import.meta.env.VITE_VIAM_API_KEY;
    const apiKeyId = import.meta.env.VITE_VIAM_API_KEY_ID;

    if (!host || !apiKey || !apiKeyId) {
      setError("Missing VITE_VIAM_HOST, VITE_VIAM_API_KEY, or VITE_VIAM_API_KEY_ID in .env");
      setStatus("error");
      return;
    }

    setStatus("connecting");
    setError(null);

    const creds = {
      type: "api-key" as const,
      payload: apiKey,
      authEntity: apiKeyId,
    };

    try {
      const machine = await VIAM.createRobotClient({
        host,
        credentials: creds,
        signalingAddress: "https://app.viam.com:443",
      });

      machineRef.current = machine;

      const robotClients: RobotClients = {
        machine,
        base: new VIAM.BaseClient(machine, COMPONENTS.BASE),
        camera: new VIAM.CameraClient(machine, COMPONENTS.CAMERA),
        faceVision: new VIAM.VisionClient(machine, SERVICES.FACE_ID),
        gestureVision: new VIAM.VisionClient(machine, SERVICES.GESTURE),
        speaker: new VIAM.AudioOutClient(machine, COMPONENTS.SPEAKER),
        webGamepad: new VIAM.InputControllerClient(machine, COMPONENTS.WEB_GAMEPAD),
        powerSensor: new VIAM.PowerSensorClient(machine, COMPONENTS.POWER_SENSOR),
        movementSensor: new VIAM.MovementSensorClient(machine, COMPONENTS.MOVEMENT_SENSOR),
      };

      setClients(robotClients);
      setStatus("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    if (machineRef.current) {
      machineRef.current.disconnect();
      machineRef.current = null;
    }
    setClients(null);
    setStatus("disconnected");
  }, []);

  // Heartbeat: detect connection loss
  useEffect(() => {
    if (!machineRef.current) return;

    const id = setInterval(async () => {
      try {
        await machineRef.current!.resourceNames();
      } catch {
        setError("Connection lost");
        setStatus("error");
        setClients(null);
        machineRef.current = null;
      }
    }, 5000);

    return () => clearInterval(id);
  }, [clients]);

  useEffect(() => {
    return () => {
      if (machineRef.current) {
        machineRef.current.disconnect();
      }
    };
  }, []);

  return { status, clients, error, connect, disconnect };
}
