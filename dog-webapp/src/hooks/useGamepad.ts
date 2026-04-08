import { useState, useEffect, useRef, useCallback } from "react";
import * as VIAM from "@viamrobotics/sdk";
import type { RobotClients } from "./useRobot";

export interface GamepadState {
  connected: boolean;
  name: string;
}

const AXIS_CONTROLS = ["AbsoluteX", "AbsoluteY", "AbsoluteRX", "AbsoluteRY"];
const BUTTON_CONTROLS = [
  "ButtonSouth",  // A / Cross
  "ButtonEast",   // B / Circle
  "ButtonWest",   // X / Square
  "ButtonNorth",  // Y / Triangle
  "ButtonLT",     // Left bumper
  "ButtonRT",     // Right bumper
  "ButtonLT2",    // Left trigger
  "ButtonRT2",    // Right trigger
  "ButtonSelect", // Back / Select
  "ButtonStart",  // Start
  "ButtonLThumb", // Left stick press
  "ButtonRThumb", // Right stick press
  "DpadUp",       // D-pad
  "DpadDown",
  "DpadLeft",
  "DpadRight",
];

const DEADZONE = 0.1;

export function useGamepad(clients: RobotClients | null) {
  const [state, setState] = useState<GamepadState>({
    connected: false,
    name: "",
  });
  const prevAxes = useRef<number[]>([]);
  const prevButtons = useRef<boolean[]>([]);
  const rafRef = useRef<number | null>(null);
  const connectedRef = useRef(false);

  const sendEvent = useCallback(
    async (event: string, control: string, value: number) => {
      if (!clients) return;
      try {
        await clients.webGamepad.triggerEvent(
          new VIAM.InputControllerEvent({
            time: { seconds: BigInt(Math.floor(Date.now() / 1000)) },
            event,
            control,
            value,
          })
        );
      } catch {
        // WebGamepad may be disabled
      }
    },
    [clients]
  );

  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      connectedRef.current = true;
      setState({ connected: true, name: e.gamepad.id });
    };
    const onDisconnect = () => {
      connectedRef.current = false;
      setState({ connected: false, name: "" });
      prevAxes.current = [];
      prevButtons.current = [];
    };

    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);

    // Check if already connected
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        connectedRef.current = true;
        setState({ connected: true, name: gp.id });
        break;
      }
    }

    const pollLoop = () => {
      // Only do work if a gamepad is connected and we have robot clients
      if (connectedRef.current && clients) {
        const gamepads = navigator.getGamepads();
        let gp: Gamepad | null = null;
        for (const g of gamepads) {
          if (g) { gp = g; break; }
        }

        if (gp) {
          const axes = Array.from(gp.axes);
          const buttons = gp.buttons.map((b) => b.pressed);

          // Send axis events
          for (let i = 0; i < axes.length && i < AXIS_CONTROLS.length; i++) {
            const val = Math.abs(axes[i]) < DEADZONE ? 0 : axes[i];
            if (val !== (prevAxes.current[i] ?? 0)) {
              sendEvent("PositionChangeAbs", AXIS_CONTROLS[i], val);
            }
          }

          // Send button events
          for (let i = 0; i < buttons.length && i < BUTTON_CONTROLS.length; i++) {
            const wasPressed = prevButtons.current[i] ?? false;
            if (buttons[i] && !wasPressed) {
              sendEvent("ButtonPress", BUTTON_CONTROLS[i], 1);
            } else if (!buttons[i] && wasPressed) {
              sendEvent("ButtonRelease", BUTTON_CONTROLS[i], 0);
            }
          }

          prevAxes.current = axes.map((v) => (Math.abs(v) < DEADZONE ? 0 : v));
          prevButtons.current = buttons;
        }
      }

      rafRef.current = requestAnimationFrame(pollLoop);
    };

    rafRef.current = requestAnimationFrame(pollLoop);

    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [sendEvent, clients]);

  return state;
}
