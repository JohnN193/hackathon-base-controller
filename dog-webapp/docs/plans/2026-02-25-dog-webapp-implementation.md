# Dog Webapp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full control panel webapp for a Unitree Go2 robot dog using the Viam TypeScript SDK.

**Architecture:** Single-page React app connecting directly to the Viam robot via WebRTC. No backend. Browser uses `@viamrobotics/sdk` to control base, stream camera, run vision services, trigger tricks, and send TTS commands.

**Tech Stack:** Vite + React + TypeScript + Tailwind CSS v4 + `@viamrobotics/sdk` + bun

---

### Task 1: Scaffold Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Create: `.env.example`, `.gitignore`

**Step 1: Create project with bun**

```bash
cd /home/nick
bun create vite dog-webapp --template react-ts
cd dog-webapp
```

Note: This will overwrite the existing empty directory. The template creates all base files.

**Step 2: Install dependencies**

```bash
bun install
bun add @viamrobotics/sdk
bun add tailwindcss @tailwindcss/vite
```

**Step 3: Configure Vite with Tailwind v4 plugin**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

**Step 4: Set up Tailwind CSS entry**

Replace `src/index.css` with:

```css
@import "tailwindcss";

@theme {
  --color-panel: #1e293b;
  --color-panel-border: #334155;
  --color-accent: #3b82f6;
  --color-accent-hover: #2563eb;
  --color-success: #22c55e;
  --color-danger: #ef4444;
  --color-warning: #eab308;
}
```

**Step 5: Create `.env.example`**

```
VITE_VIAM_HOST=your-machine.your-org.viam.cloud
VITE_VIAM_API_KEY=your-api-key
VITE_VIAM_API_KEY_ID=your-api-key-id
```

**Step 6: Add `.env` to `.gitignore`**

Append to the generated `.gitignore`:

```
.env
```

**Step 7: Create placeholder App**

Replace `src/App.tsx` with:

```tsx
function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">Dog Webapp</h1>
    </div>
  );
}

export default App;
```

**Step 8: Verify it runs**

```bash
bun run dev
```

Expected: Dev server starts, browser shows "Dog Webapp" in white on dark background.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TypeScript + Tailwind project"
```

---

### Task 2: Robot config constants and types

**Files:**
- Create: `src/lib/robot-config.ts`

**Step 1: Create robot config file**

```ts
// Component names from the Viam robot config
export const COMPONENTS = {
  BASE: "base-1",
  CAMERA: "camera-1",
  SPEAKER: "audio_out-1",
  MICROPHONE: "audio_in-1",
  LOCAL_CONTROLLER: "localController",
  WEB_GAMEPAD: "WebGamepad",
} as const;

// Service names from the Viam robot config
export const SERVICES = {
  DOG_CONTROLLER: "dog-controller-registry",
  FACE_ID: "people",
  TTS_COORDINATOR: "tts-coordinator",
  GESTURE: "gesture",
} as const;

// Known fun commands for the base (doCommand)
export const TRICKS = [
  { id: "hello", label: "Hello", cmd: "hello" },
  { id: "heart", label: "Heart", cmd: "heart" },
] as const;

// Movement defaults (matching dog-controller config)
export const MOVEMENT = {
  MAX_LINEAR_MM_PER_SEC: 1000,
  MAX_ANGULAR_DEG_PER_SEC: 60,
  DEFAULT_LINEAR_MM_PER_SEC: 500,
  DEFAULT_ANGULAR_DEG_PER_SEC: 30,
} as const;
```

**Step 2: Commit**

```bash
git add src/lib/robot-config.ts
git commit -m "feat: add robot component/service name constants"
```

---

### Task 3: Connection hook (useRobot)

**Files:**
- Create: `src/hooks/useRobot.ts`
- Create: `src/context/RobotContext.tsx`

**Step 1: Create the useRobot hook**

This hook manages the Viam robot connection lifecycle and exposes typed clients.

```ts
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

    try {
      const machine = await VIAM.createRobotClient({
        host,
        credentials: {
          type: "api-key",
          payload: apiKey,
          authEntity: apiKeyId,
        },
        signalingAddress: "https://app.viam.com:443",
      });

      machineRef.current = machine;

      const robotClients: RobotClients = {
        machine,
        base: new VIAM.BaseClient(machine, COMPONENTS.BASE),
        camera: new VIAM.CameraClient(machine, COMPONENTS.CAMERA),
        faceVision: new VIAM.VisionClient(machine, SERVICES.FACE_ID),
        gestureVision: new VIAM.VisionClient(machine, SERVICES.GESTURE),
        ttsCoordinator: new VIAM.GenericServiceClient(machine, SERVICES.TTS_COORDINATOR),
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
    setClients(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      if (machineRef.current) {
        machineRef.current.disconnect();
      }
    };
  }, []);

  return { status, clients, error, connect, disconnect };
}
```

**Step 2: Create the React context provider**

```tsx
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
```

**Step 3: Commit**

```bash
git add src/hooks/useRobot.ts src/context/RobotContext.tsx
git commit -m "feat: add useRobot connection hook and RobotContext provider"
```

---

### Task 4: StatusBar component

**Files:**
- Create: `src/components/StatusBar.tsx`

**Step 1: Implement StatusBar**

```tsx
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
```

**Step 2: Commit**

```bash
git add src/components/StatusBar.tsx
git commit -m "feat: add StatusBar with connection controls"
```

---

### Task 5: Camera stream component

**Files:**
- Create: `src/components/CameraStream.tsx`

**Step 1: Implement CameraStream**

This uses the Viam SDK's `StreamClient` to get a live WebRTC `MediaStream` and renders it in a `<video>` element.

```tsx
import { useEffect, useRef, useState } from "react";
import { StreamClient } from "@viamrobotics/sdk";
import { useRobotContext } from "../context/RobotContext";
import { COMPONENTS } from "../lib/robot-config";

export function CameraStream() {
  const { clients } = useRobotContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!clients) return;

    let cancelled = false;
    const streamClient = new StreamClient(clients.machine);

    const startStream = async () => {
      try {
        const mediaStream = await streamClient.getStream(COMPONENTS.CAMERA);
        if (cancelled) return;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
          setStreaming(true);
          setStreamError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setStreamError(err instanceof Error ? err.message : String(err));
        setStreaming(false);
      }
    };

    startStream();

    return () => {
      cancelled = true;
      streamClient.remove(COMPONENTS.CAMERA).catch(() => {});
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStreaming(false);
    };
  }, [clients]);

  if (!clients) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-lg">
        <span className="text-gray-500">Connect to robot to see camera</span>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain"
      />
      {!streaming && !streamError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-gray-400 animate-pulse">Connecting stream...</span>
        </div>
      )}
      {streamError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-danger text-sm">Stream error: {streamError}</span>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/CameraStream.tsx
git commit -m "feat: add CameraStream with WebRTC video"
```

---

### Task 6: Movement control component (virtual joystick)

**Files:**
- Create: `src/components/MovementControl.tsx`

**Step 1: Implement virtual joystick**

A custom joystick built with mouse/touch events. No external dependency needed. Dragging the knob sets velocity on the base; releasing it stops the base.

```tsx
import { useRef, useState, useCallback, useEffect } from "react";
import { useRobotContext } from "../context/RobotContext";
import { MOVEMENT } from "../lib/robot-config";

export function MovementControl() {
  const { clients } = useRobotContext();
  const [maxLinear, setMaxLinear] = useState(MOVEMENT.DEFAULT_LINEAR_MM_PER_SEC);
  const [maxAngular, setMaxAngular] = useState(MOVEMENT.DEFAULT_ANGULAR_DEG_PER_SEC);
  const [position, setPosition] = useState({ x: 0, y: 0 }); // -1 to 1
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;

    let dx = (clientX - centerX) / radius;
    let dy = -(clientY - centerY) / radius; // invert Y so up is positive

    // Clamp to unit circle
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }

    setPosition({ x: dx, y: dy });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX, e.clientY);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX, e.clientY);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    setPosition({ x: 0, y: 0 });
  }, []);

  // Send velocity commands at a fixed rate while dragging
  useEffect(() => {
    if (!clients) return;

    sendIntervalRef.current = setInterval(async () => {
      try {
        if (position.x === 0 && position.y === 0) {
          await clients.base.stop();
        } else {
          await clients.base.setVelocity(
            { x: 0, y: position.y * maxLinear, z: 0 },
            { x: 0, y: 0, z: -position.x * maxAngular }
          );
        }
      } catch {
        // ignore transient errors
      }
    }, 100); // 10Hz command rate

    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [clients, position, maxLinear, maxAngular]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      clients?.base.stop().catch(() => {});
    };
  }, [clients]);

  const knobX = 50 + position.x * 40; // percent
  const knobY = 50 - position.y * 40; // percent (invert Y for CSS)

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Movement</h2>

      {/* Joystick */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-40 h-40 mx-auto rounded-full bg-slate-800 border-2 border-panel-border cursor-pointer touch-none select-none"
      >
        {/* Crosshairs */}
        <div className="absolute left-1/2 top-2 bottom-2 w-px bg-slate-700 -translate-x-1/2" />
        <div className="absolute top-1/2 left-2 right-2 h-px bg-slate-700 -translate-y-1/2" />
        {/* Knob */}
        <div
          className="absolute w-8 h-8 rounded-full bg-accent shadow-lg shadow-accent/30 -translate-x-1/2 -translate-y-1/2 transition-none"
          style={{ left: `${knobX}%`, top: `${knobY}%` }}
        />
      </div>

      {/* Speed sliders */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">
          Linear: {maxLinear} mm/s
        </span>
        <input
          type="range"
          min={100}
          max={MOVEMENT.MAX_LINEAR_MM_PER_SEC}
          step={50}
          value={maxLinear}
          onChange={(e) => setMaxLinear(Number(e.target.value))}
          className="accent-accent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">
          Angular: {maxAngular} deg/s
        </span>
        <input
          type="range"
          min={5}
          max={MOVEMENT.MAX_ANGULAR_DEG_PER_SEC}
          step={5}
          value={maxAngular}
          onChange={(e) => setMaxAngular(Number(e.target.value))}
          className="accent-accent"
        />
      </label>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/MovementControl.tsx
git commit -m "feat: add MovementControl with virtual joystick and speed sliders"
```

---

### Task 7: Trick buttons component

**Files:**
- Create: `src/components/TrickButtons.tsx`

**Step 1: Implement TrickButtons**

```tsx
import { useState } from "react";
import { useRobotContext } from "../context/RobotContext";
import { TRICKS } from "../lib/robot-config";

export function TrickButtons() {
  const { clients } = useRobotContext();
  const [activeTrick, setActiveTrick] = useState<string | null>(null);

  const executeTrick = async (cmd: string, id: string) => {
    if (!clients || activeTrick) return;

    setActiveTrick(id);
    try {
      await clients.base.doCommand({ cmd });
    } catch (err) {
      console.error(`Trick "${cmd}" failed:`, err);
    } finally {
      setActiveTrick(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Tricks</h2>
      <div className="grid grid-cols-2 gap-2">
        {TRICKS.map((trick) => (
          <button
            key={trick.id}
            onClick={() => executeTrick(trick.cmd, trick.id)}
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
```

**Step 2: Commit**

```bash
git add src/components/TrickButtons.tsx
git commit -m "feat: add TrickButtons for fun dog commands"
```

---

### Task 8: Speech panel component

**Files:**
- Create: `src/components/SpeechPanel.tsx`

**Step 1: Implement SpeechPanel**

```tsx
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
      await clients.ttsCoordinator.doCommand({ speak: text.trim() });
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
```

**Step 2: Commit**

```bash
git add src/components/SpeechPanel.tsx
git commit -m "feat: add SpeechPanel for TTS commands"
```

---

### Task 9: Vision panel component

**Files:**
- Create: `src/components/VisionPanel.tsx`

**Step 1: Implement VisionPanel**

Polls face identification and gesture detection services every 2 seconds.

```tsx
import { useEffect, useState, useRef } from "react";
import { useRobotContext } from "../context/RobotContext";
import { COMPONENTS } from "../lib/robot-config";

interface Detection {
  className: string;
  confidence: number;
}

export function VisionPanel() {
  const { clients } = useRobotContext();
  const [faces, setFaces] = useState<Detection[]>([]);
  const [waveDetected, setWaveDetected] = useState(false);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!clients) {
      setFaces([]);
      setWaveDetected(false);
      return;
    }

    setPolling(true);

    const poll = async () => {
      try {
        const faceDetections = await clients.faceVision.getDetectionsFromCamera(COMPONENTS.CAMERA);
        setFaces(
          faceDetections.map((d) => ({
            className: d.className ?? "unknown",
            confidence: d.confidence ?? 0,
          }))
        );
      } catch {
        // Vision service may not always respond
      }

      try {
        const gestureDetections = await clients.gestureVision.getDetectionsFromCamera(COMPONENTS.CAMERA);
        setWaveDetected(gestureDetections.some((d) => d.confidence && d.confidence > 0.5));
      } catch {
        // Gesture service may not always respond
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPolling(false);
    };
  }, [clients]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Vision</h2>

      {/* Faces */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">Faces</h3>
        {faces.length === 0 ? (
          <p className="text-xs text-gray-600">
            {clients ? "No faces detected" : "Not connected"}
          </p>
        ) : (
          <ul className="space-y-1">
            {faces.map((face, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{face.className}</span>
                <span className="text-xs text-gray-500">
                  {(face.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Gesture */}
      <div>
        <h3 className="text-xs text-gray-500 mb-1">Gesture</h3>
        <p className={`text-sm ${waveDetected ? "text-success" : "text-gray-600"}`}>
          {waveDetected ? "Wave detected" : "No wave"}
        </p>
      </div>

      {polling && (
        <p className="text-[10px] text-gray-700">Polling every 2s</p>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/VisionPanel.tsx
git commit -m "feat: add VisionPanel polling face ID and gesture detection"
```

---

### Task 10: Gamepad support component

**Files:**
- Create: `src/components/GamepadStatus.tsx`
- Create: `src/hooks/useGamepad.ts`

**Step 1: Create useGamepad hook**

This hook reads the browser Gamepad API and forwards events to the Viam `WebGamepad` input controller via `triggerEvent()`.

```ts
import { useState, useEffect, useRef, useCallback } from "react";
import * as VIAM from "@viamrobotics/sdk";
import type { RobotClients } from "./useRobot";

export interface GamepadState {
  connected: boolean;
  name: string;
  axes: number[];
  buttons: boolean[];
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
    axes: [],
    buttons: [],
  });
  const prevAxes = useRef<number[]>([]);
  const prevButtons = useRef<boolean[]>([]);
  const rafRef = useRef<number | null>(null);

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
      setState((s) => ({ ...s, connected: true, name: e.gamepad.id }));
    };
    const onDisconnect = () => {
      setState({ connected: false, name: "", axes: [], buttons: [] });
      prevAxes.current = [];
      prevButtons.current = [];
    };

    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);

    // Check if already connected
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        setState({ connected: true, name: gp.id, axes: [], buttons: [] });
        break;
      }
    }

    const pollLoop = () => {
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
        setState((s) => ({ ...s, axes, buttons }));
      }

      rafRef.current = requestAnimationFrame(pollLoop);
    };

    rafRef.current = requestAnimationFrame(pollLoop);

    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [sendEvent]);

  return state;
}
```

**Step 2: Create GamepadStatus component**

```tsx
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
```

**Step 3: Commit**

```bash
git add src/hooks/useGamepad.ts src/components/GamepadStatus.tsx
git commit -m "feat: add browser Gamepad API support forwarding to WebGamepad"
```

---

### Task 11: Assemble App layout

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Step 1: Update main.tsx to include RobotProvider**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { RobotProvider } from "./context/RobotContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RobotProvider>
      <App />
    </RobotProvider>
  </StrictMode>
);
```

**Step 2: Update App.tsx with the full layout**

```tsx
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
          <div className="flex-1 grid grid-cols-[240px_1fr_220px] gap-px bg-panel-border min-h-0">
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
```

**Step 3: Clean up unused template files**

Delete `src/App.css` and `src/assets/react.svg` if they exist (generated by the Vite template but not needed).

```bash
rm -f src/App.css src/assets/react.svg
```

**Step 4: Verify it builds**

```bash
bun run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 5: Verify dev server runs**

```bash
bun run dev
```

Expected: App shows "Dog Webapp" StatusBar with Connect button. Clicking Connect attempts to connect (will fail without valid `.env` values, which is expected).

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: assemble full control panel layout with all components"
```

---

### Task 12: End-to-end testing with real robot

**Files:**
- Modify: `.env` (user fills in real credentials)

**Step 1: Set up .env with real credentials**

The user must fill in their Viam robot's credentials:

```
VITE_VIAM_HOST=your-machine.your-org.viam.cloud
VITE_VIAM_API_KEY=your-actual-api-key
VITE_VIAM_API_KEY_ID=your-actual-api-key-id
```

Get these from the Viam app: go to your machine → CONNECT tab → copy the API key details.

**Step 2: Test connection**

```bash
bun run dev
```

1. Open browser to `http://localhost:5173`
2. Click "Connect"
3. Verify StatusBar shows "connected" with green dot

**Step 3: Test camera stream**

- Verify live video appears in the center panel
- If stream fails, check browser console for errors

**Step 4: Test movement**

- Drag the virtual joystick
- Verify the dog moves
- Release joystick, verify it stops
- Adjust speed sliders

**Step 5: Test tricks**

- Click "Hello" button, verify dog performs hello gesture
- Click "Heart" button, verify dog performs heart gesture

**Step 6: Test speech**

- Type a message in the speech input
- Click Speak, verify the dog says it through the speaker

**Step 7: Test vision**

- Stand in front of the camera
- Verify face detection results appear in the Vision panel
- Wave at the camera, verify wave detection shows "Wave detected"

**Step 8: Test gamepad (if available)**

- Connect a physical gamepad to the computer
- Verify "Gamepad: [name]" appears in the bottom-left
- Move sticks, verify dog responds
- Note: The `WebGamepad` component must be enabled in your Viam robot config for this to work

**Step 9: Final commit**

```bash
git add .env.example
git commit -m "docs: finalize .env.example with setup instructions"
```
