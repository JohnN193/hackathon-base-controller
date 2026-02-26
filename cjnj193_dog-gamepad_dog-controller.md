# Model cjnj193:dog-gamepad:dog-controller

A gamepad controller service for a base using the `funBaseControl` mode. The left joystick drives linear motion (X/Y), the right joystick drives angular motion (Z/X). Any button or axis can additionally be mapped to an arbitrary `DoCommand` call on the base via `fun_commands`.

## Configuration

```json
{
  "base": "<base-name>",
  "input_controller": "<input-controller-name>",
  "max_linear_mm_per_sec": 300.0,
  "max_angular_deg_per_sec": 90.0,
  "dead_zone": 0.27,
  "denoise_threshold": 0.05,
  "fun_commands": {
    "ButtonSouth": {
      "cmd": "sit",
      "input": null
    },
    "AbsoluteHat0Y": {
      "cmd": "tilt",
      "input": "$value",
      "value_scale": 100.0
    }
  }
}
```

### Attributes

| Name | Type | Inclusion | Description |
|------|------|-----------|-------------|
| `base` | string | Required | Name of the base component to control |
| `input_controller` | string | Required | Name of the input controller (gamepad) component |
| `max_linear_mm_per_sec` | float | Optional | Maximum linear velocity in mm/s. If set (with `max_angular_deg_per_sec`), uses `SetVelocity`; otherwise uses `SetPower` (0–1 range) |
| `max_angular_deg_per_sec` | float | Optional | Maximum angular velocity in deg/s. Must be set together with `max_linear_mm_per_sec` |
| `fun_commands` | object | Optional | Map of input control names to `DoCommand` calls forwarded to the base |
| `dead_zone` | float | Optional | Joystick axis values at or below this magnitude are treated as zero. Default: `0.27` |
| `denoise_threshold` | float | Optional | Minimum change in linear or angular value required to send a new command to the base. Default: `0.05` |

#### `fun_commands` entry fields

| Name | Type | Inclusion | Description |
|------|------|-----------|-------------|
| `cmd` | string | Required | The command key passed to the base's `DoCommand` |
| `input` | any | Optional | The value associated with the command key. Use the special string `"$value"` to forward the event's value (see below) |
| `value_scale` | float | Optional | Multiplier applied to the event value when `input` is `"$value"`. Defaults to `1.0` |
| `event_type` | string | Optional | Which event triggers the command. Defaults to `ButtonPress` for button controls and `PositionChangeAbs` for axis controls. Valid values depend on the control type (see below) |

**`event_type` valid values by control type:**

- Button controls (`Button*`): `ButtonPress`, `ButtonRelease`, `ButtonHold`, `ButtonChange`
- Axis controls (`Absolute*`): `PositionChangeAbs`, `PositionChangeRel`

Mismatched `event_type` values (e.g. `ButtonPress` on an axis control) are rejected at startup.

**Using `"$value"` as input:**

When `input` is set to `"$value"`, the actual event value is forwarded to the base's `DoCommand` instead of a static value. This is useful for axis controls where the value encodes direction and magnitude — for example, `AbsoluteHat0Y` produces `-1.0` (up) or `1.0` (down). Use `value_scale` to convert to the units your base expects.

> **Tip:** Before configuring `fun_commands`, check the  `input_controller` to confirm which controls your gamepad exposes, and test the inputs manually to verify the event values and directions you'll receive.

#### Valid `fun_commands` keys (input controls)

Button controls: `ButtonSouth`, `ButtonEast`, `ButtonWest`, `ButtonNorth`, `ButtonLT`, `ButtonRT`, `ButtonLT2`, `ButtonRT2`, `ButtonLThumb`, `ButtonRThumb`, `ButtonSelect`, `ButtonStart`, `ButtonMenu`, `ButtonRecord`, `ButtonEStop`

Axis controls: `AbsoluteZ`, `AbsoluteRZ`, `AbsoluteHat0X`, `AbsoluteHat0Y`, `AbsolutePedalAccelerator`, `AbsolutePedalBrake`, `AbsolutePedalClutch`

> Note: `AbsoluteX`, `AbsoluteY`, `AbsoluteRX`, and `AbsoluteRY` are reserved for driving the base and cannot be used as `fun_commands` keys.

### Joystick Mapping

| Axis | Action |
|------|--------|
| Left stick X (`AbsoluteX`) | Linear X |
| Left stick Y (`AbsoluteY`) | Linear Y |
| Right stick X (`AbsoluteRX`) | Angular Z (yaw) |
| Right stick Y (`AbsoluteRY`) | Angular X (pitch) |

Inputs within the dead zone (default ±0.27, configurable via `dead_zone`) are treated as zero. Values are rounded to one decimal place.

## DoCommand

### `get_controller_inputs`

Returns the list of input controls currently being monitored by the service — always includes the four joystick axes plus any controls configured in `fun_commands`.

**Request:**
```json
{ "get_controller_inputs": {} }
```

**Response:**
```json
{
  "controller_inputs": [
    "AbsoluteX",
    "AbsoluteY",
    "AbsoluteRX",
    "AbsoluteRY",
    "ButtonSouth",
    "ButtonNorth"
  ]
}
```
