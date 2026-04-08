import { useState, useEffect, useCallback, useRef } from "react";
import * as VIAM from "@viamrobotics/sdk";
import { COMPONENTS, SERVICES } from "../lib/robot-config";

export interface RobotClients {
  machine: VIAM.RobotClient;
  base: VIAM.BaseClient;
  camera: VIAM.CameraClient;
  faceVision: VIAM.VisionClient;
  gestureVision: VIAM.VisionClient;
  ttsCoordinator: VIAM.GenericServiceClient;
  webGamepad: VIAM.InputControllerClient;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function useRobot() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [clients, setClients] = useState<RobotClients | null>(null);
  const [error, setError] = useState<string | null>(null);
  const machineRef = useRef<VIAM.RobotClient | null>(null);
  const dog1Ref = useRef<VIAM.RobotClient | null>(null);

  const connect = useCallback(async () => {
    const host = import.meta.env.VITE_VIAM_HOST;
    const dog1Host = import.meta.env.VITE_VIAM_DOG1_HOST;
    const apiKey = import.meta.env.VITE_VIAM_API_KEY;
    const apiKeyId = import.meta.env.VITE_VIAM_API_KEY_ID;

    if (!host || !apiKey || !apiKeyId) {
      setError("Missing VITE_VIAM_HOST, VITE_VIAM_API_KEY, or VITE_VIAM_API_KEY_ID in .env");
      setStatus("error");
      return;
    }

    if (!dog1Host) {
      setError("Missing VITE_VIAM_DOG1_HOST in .env");
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
      const [machine, dog1] = await Promise.all([
        VIAM.createRobotClient({
          host,
          credentials: creds,
          signalingAddress: "https://app.viam.com:443",
        }),
        VIAM.createRobotClient({
          host: dog1Host,
          credentials: creds,
          signalingAddress: "https://app.viam.com:443",
        }),
      ]);

      machineRef.current = machine;
      dog1Ref.current = dog1;

      const robotClients: RobotClients = {
        machine,
        base: new VIAM.BaseClient(machine, COMPONENTS.BASE),
        camera: new VIAM.CameraClient(machine, COMPONENTS.CAMERA),
        faceVision: new VIAM.VisionClient(machine, SERVICES.FACE_ID),
        gestureVision: new VIAM.VisionClient(machine, SERVICES.GESTURE),
        ttsCoordinator: new VIAM.GenericServiceClient(dog1, SERVICES.TTS_COORDINATOR),
        webGamepad: new VIAM.InputControllerClient(machine, COMPONENTS.WEB_GAMEPAD),
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
    if (dog1Ref.current) {
      dog1Ref.current.disconnect();
      dog1Ref.current = null;
    }
    setClients(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      if (machineRef.current) {
        machineRef.current.disconnect();
      }
      if (dog1Ref.current) {
        dog1Ref.current.disconnect();
      }
    };
  }, []);

  return { status, clients, error, connect, disconnect };
}
