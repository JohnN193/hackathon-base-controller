# Dog Webapp Design

## Overview

A full control panel webapp for a Unitree Go2 robot dog managed via Viam. Internal team tool built as a React SPA that connects directly to the robot via WebRTC.

## Stack

- **Framework:** Vite + React + TypeScript
- **Robot SDK:** `@viamrobotics/sdk`
- **Styling:** Tailwind CSS (dark theme)
- **Package manager:** bun

## Robot Components (from config)

| Name | API | Purpose |
|------|-----|---------|
| `base-1` | `rdk:component:base` | Unitree Go2 locomotion (model: `cjnj193:unitree:go2-dog`) |
| `camera-1` | `rdk:component:camera` | Front camera 720p (model: `cjnj193:unitree:go2-dog-camera`) |
| `audio_out-1` | `rdk:component:audio_out` | Speaker (model: `cjnj193:unitree:go2-dog-speaker`) |
| `audio_in-1` | `rdk:component:audio_in` | Microphone - currently disabled |
| `localController` | `rdk:component:input_controller` | Physical gamepad (model: `gamepad`) |
| `WebGamepad` | `rdk:component:input_controller` | Browser gamepad (model: `webgamepad`) - currently disabled |
| `base-fake` | `rdk:component:base` | Fake base for testing |

## Robot Services (from config)

| Name | API | Purpose |
|------|-----|---------|
| `dog-controller-registry` | `rdk:service:generic` | Custom gamepad-to-dog-movement mapping with fun commands |
| `people` | `rdk:service:vision` | Face identification (model: `viam:vision:face-identification`) |
| `tts-coordinator` | `rdk:service:generic` | Text-to-speech coordinator |
| `gesture` | `rdk:service:vision` | Hand wave detection (model: `viam:hand-gesture:wave-detector`) |

## Architecture

Single-page React app. No backend server. The browser connects directly to the Viam robot using the TypeScript SDK over WebRTC. API keys stored in `.env` file (acceptable for internal team use).

```
Browser (React SPA)
  └─ @viamrobotics/sdk
       └─ WebRTC connection
            └─ Viam robot (Go2 dog)
```

## Project Structure

```
dog-webapp/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── hooks/
│   │   └── useRobot.ts
│   ├── components/
│   │   ├── CameraStream.tsx
│   │   ├── MovementControl.tsx
│   │   ├── TrickButtons.tsx
│   │   ├── SpeechPanel.tsx
│   │   ├── VisionPanel.tsx
│   │   ├── GamepadStatus.tsx
│   │   └── StatusBar.tsx
│   └── lib/
│       └── robot-config.ts
├── .env
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  StatusBar: [Connected]  Dog Webapp  [Gamepad: Xbox] │
├───────────────┬─────────────────────┬───────────────┤
│               │                     │               │
│  Movement     │   Camera Stream     │  Vision       │
│  Control      │   (live WebRTC)     │  Panel        │
│               │                     │               │
│  Virtual      │                     │  Faces:       │
│  Joystick     │                     │  - Nick       │
│               │                     │  - Unknown    │
│  Speed slider │                     │               │
│               │                     │  Gesture:     │
│               │                     │  Wave detected│
├───────────────┼─────────────────────┴───────────────┤
│  Tricks       │  Speech Panel                       │
│  [Hello] [Heart]│ [Type message...       ] [Speak]  │
│  [Sit] [Stand]│                                     │
└───────────────┴─────────────────────────────────────┘
```

## Component Details

### Connection (useRobot hook)
- Connect to robot using `VIAM.createRobotClient()` with credentials from `.env`
- Instantiate all needed clients: BaseClient, CameraClient, VisionClient, GenericServiceClient
- Provide clients via React context
- Handle disconnect/reconnect

### Camera Stream
- Use Viam SDK's `StreamClient` to establish WebRTC video stream from `camera-1`
- Render into HTML `<video>` element
- Fallback: poll `getImage()` if stream fails

### Movement Control
- Virtual joystick (touch/mouse draggable)
- Maps X/Y position to `base.setVelocity()` calls
- Configurable max speed slider (linear mm/s, angular deg/s)
- Defaults: max 1000 mm/s linear, 60 deg/s angular (matching dog-controller config)

### Gamepad Support
- Use browser Gamepad API to detect physical controllers
- Forward stick/button state to `WebGamepad` input controller via `triggerEvent()`
- Show gamepad connection status in StatusBar
- Note: `WebGamepad` component must be enabled in Viam config for this to work

### Trick Buttons
- Call `doCommand` on `base-1` with fun commands
- Known commands from config: `{cmd: "hello"}`, `{cmd: "heart"}`
- Discover additional available commands from module docs

### Speech Panel
- Text input field + Speak button
- Call `doCommand` on `tts-coordinator` generic service with text payload

### Vision Panel
- Poll `people` vision service every 1-2 seconds using `getDetectionsFromCamera()`
- Poll `gesture` vision service for wave detection
- Display detected faces with names and confidence scores
- Show wave detection status

### StatusBar
- Connection status indicator
- Gamepad connection status
- Disconnect button

## Configuration

`.env` file:
```
VITE_VIAM_HOST=your-machine.your-org.viam.cloud
VITE_VIAM_API_KEY=your-api-key
VITE_VIAM_API_KEY_ID=your-api-key-id
```

## Dependencies

- `@viamrobotics/sdk` - Viam TypeScript SDK
- `react`, `react-dom` - UI framework
- `tailwindcss` - Styling
- Dev: `vite`, `typescript`, `@types/react`, `@types/react-dom`
