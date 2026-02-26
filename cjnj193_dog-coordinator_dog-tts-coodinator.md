# Model cjnj193:dog-coordinator:dog-tts-coodinator

A coordinator service that periodically captures camera frames, runs people detection, and speaks detected names aloud via an audio output component.

## Configuration

```json
{
  "base": "<base-name>",
  "camera": "<camera-name>",
  "audio_out": "<audio-out-name>",
  "gesture": "<vision-service-name>",
  "people": "<vision-service-name>"
}
```

### Attributes

| Name | Type | Inclusion | Description |
|------|------|-----------|-------------|
| `base` | string | Required | Name of the base component |
| `camera` | string | Required | Name of the camera component used for capturing frames |
| `audio_out` | string | Required | Name of the audio output component used to speak names |
| `gesture` | string | Required | Name of the vision service used for gesture detection |
| `people` | string | Required | Name of the vision service used for people detection |

## Behavior

Every 5 seconds the service captures a frame from the camera, runs it through the people vision service, and if a person is detected speaks their name via the audio output component's `speak` DoCommand.

## DoCommand

### `say_this`

Speaks an arbitrary string immediately via the audio output component.

**Request:**
```json
{ "say_this": "hello world" }
```

