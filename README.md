# Module dog-gamepad

A Viam module for controlling a robot dog. Provides gamepad-based base control and a TTS coordinator that announces detected people by name.

## Models

### [`cjnj193:dog-gamepad:dog-controller`](cjnj193_dog-gamepad_dog-controller.md)

A gamepad controller service for a base. The left joystick drives linear motion (X/Y), the right joystick drives angular motion. Any button or axis can be mapped to an arbitrary `DoCommand` call on the base via `fun_commands`.

### [`cjnj193:dog-gamepad:dog-tts-coodinator`](cjnj193_dog-gamepad_dog-tts-coodinator.md)

A coordinator service that periodically captures camera frames, runs people detection, and speaks detected names aloud via an audio output component. Also accepts a `say_this` DoCommand to speak arbitrary text.
