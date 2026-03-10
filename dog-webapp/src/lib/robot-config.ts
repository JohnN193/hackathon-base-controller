// Component names from the Viam robot config
export const COMPONENTS = {
  BASE: "dog",
  CAMERA: "camera",
  SPEAKER: "speaker",
  MICROPHONE: "audio_in-1",
  LOCAL_CONTROLLER: "localController",
  WEB_GAMEPAD: "WebGamepad",
} as const;

// Service names from the Viam robot config
export const SERVICES = {
  DOG_CONTROLLER: "dog-controller-registry",
  FACE_ID: "people",
  TTS_COORDINATOR: "generic-1",
  GESTURE: "gesture",
} as const;

// Known fun commands for the dog base (doCommand: { trick: "" })
// Tricks with a `command` field send that object; otherwise { [id]: "" }
export interface Trick {
  id: string;
  label: string;
  command?: Record<string, unknown>;
}

export const TRICKS: readonly Trick[] = [
  { id: "hello", label: "Hello" },
  { id: "heart", label: "Heart" },
  { id: "dance", label: "Dance" },
  { id: "backflip", label: "Backflip" },
  { id: "frontflip", label: "Frontflip" },
  { id: "leftflip", label: "Left Flip" },
  { id: "rightflip", label: "Right Flip" },
  { id: "wallow", label: "Wallow" },
  { id: "scrape", label: "Scrape" },
  {
    id: "look_up",
    label: "Look Up",
    command: { pose_delta: { roll_deg: 0, pitch_deg: -60, yaw_deg: 0 } },
  },
];

// Movement defaults (matching dog-controller config)
export const MOVEMENT = {
  MAX_LINEAR_MM_PER_SEC: 1000,
  MAX_ANGULAR_DEG_PER_SEC: 60,
  DEFAULT_LINEAR_MM_PER_SEC: 500,
  DEFAULT_ANGULAR_DEG_PER_SEC: 30,
} as const;
