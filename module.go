package basegamepadcontroller

import (
	"context"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/golang/geo/r3"
	"github.com/pkg/errors"
	vutils "go.viam.com/utils"

	"go.viam.com/rdk/components/base"
	"go.viam.com/rdk/components/input"
	"go.viam.com/rdk/logging"
	"go.viam.com/rdk/resource"
	"go.viam.com/rdk/services/generic"
	"go.viam.com/rdk/session"
)

var DogController = resource.NewModel("cjnj193", "dog-gamepad", "dog-controller")

func init() {
	resource.RegisterService(generic.API, DogController,
		resource.Registration[resource.Resource, *Config]{
			Constructor: newBaseGamepadControllerDogController,
		},
	)
}

// FunCommand describes a DoCommand call to issue on the base when a particular input event fires.
// If DoCommandInput is the string "$value", it will be replaced with the event's value multiplied
// by ValueScale (default 1.0) at dispatch time.
type FunCommand struct {
	Command        string      `json:"cmd,omitempty"`
	DoCommandInput interface{} `json:"input,omitempty"`
	EventType      string      `json:"event_type,omitempty"`
	ValueScale     float64     `json:"value_scale,omitempty"`
}

// Config describes how to configure the service.
type Config struct {
	BaseName            string                `json:"base"`
	InputControllerName string                `json:"input_controller"`
	MaxAngularVelocity  float64               `json:"max_angular_deg_per_sec,omitempty"`
	MaxLinearVelocity   float64               `json:"max_linear_mm_per_sec,omitempty"`
	FunCommands         map[string]FunCommand `json:"fun_commands,omitempty"`
	DeadZone            float64               `json:"dead_zone,omitempty"`
	DenoiseThreshold    float64               `json:"denoise_threshold,omitempty"`
}

func (cfg *Config) deadZone() float64 {
	if cfg.DeadZone > 0 {
		return cfg.DeadZone
	}
	return 0.27
}

func (cfg *Config) denoiseThreshold() float64 {
	if cfg.DenoiseThreshold > 0 {
		return cfg.DenoiseThreshold
	}
	return 0.05
}

// Validate ensures all parts of the config are valid and returns implicit dependencies.
func (cfg *Config) Validate(path string) ([]string, []string, error) {
	var deps []string

	if cfg.InputControllerName == "" {
		return nil, nil, resource.NewConfigValidationFieldRequiredError(path, "input_controller")
	}
	deps = append(deps, cfg.InputControllerName)

	if cfg.BaseName == "" {
		return nil, nil, resource.NewConfigValidationFieldRequiredError(path, "base")
	}
	deps = append(deps, cfg.BaseName)

	validControls := map[input.Control]bool{
		input.AbsoluteX: false, input.AbsoluteY: false, input.AbsoluteZ: true,
		input.AbsoluteRX: false, input.AbsoluteRY: false, input.AbsoluteRZ: true,
		input.AbsoluteHat0X: true, input.AbsoluteHat0Y: true,
		input.ButtonSouth: true, input.ButtonEast: true, input.ButtonWest: true, input.ButtonNorth: true,
		input.ButtonLT: true, input.ButtonRT: true, input.ButtonLT2: true, input.ButtonRT2: true,
		input.ButtonLThumb: true, input.ButtonRThumb: true,
		input.ButtonSelect: true, input.ButtonStart: true, input.ButtonMenu: true,
		input.ButtonRecord: true, input.ButtonEStop: true,
		input.AbsolutePedalAccelerator: true, input.AbsolutePedalBrake: true, input.AbsolutePedalClutch: true,
	}
	validButtonEventTypes := map[input.EventType]bool{
		input.ButtonPress: true, input.ButtonRelease: true,
		input.ButtonHold: true, input.ButtonChange: true,
	}
	validAbsoluteEventTypes := map[input.EventType]bool{
		input.PositionChangeAbs: true, input.PositionChangeRel: true,
	}
	for k, fc := range cfg.FunCommands {
		if !validControls[input.Control(k)] {
			return nil, nil, resource.NewConfigValidationError(path,
				errors.Errorf("fun_commands key '%s' is not a valid input control", k))
		}
		if fc.EventType != "" {
			isButton := strings.HasPrefix(k, "Button")
			if isButton && !validButtonEventTypes[input.EventType(fc.EventType)] {
				return nil, nil, resource.NewConfigValidationError(path,
					errors.Errorf("fun_commands key '%s' has invalid event_type '%s' for a button control", k, fc.EventType))
			}
			if !isButton && !validAbsoluteEventTypes[input.EventType(fc.EventType)] {
				return nil, nil, resource.NewConfigValidationError(path,
					errors.Errorf("fun_commands key '%s' has invalid event_type '%s' for an absolute control", k, fc.EventType))
			}
		}
	}

	return deps, nil, nil
}

type baseGamepadControllerDogController struct {
	resource.AlwaysRebuild

	name   resource.Name
	logger logging.Logger
	cfg    *Config

	mu              sync.RWMutex
	base            base.Base
	inputController input.Controller

	state                   throttleState
	cancel                  func()
	cancelCtx               context.Context
	activeBackgroundWorkers sync.WaitGroup
	events                  chan struct{}
	funCmdQueue             chan map[string]interface{}
	instance                atomic.Int64
}

func newBaseGamepadControllerDogController(ctx context.Context, deps resource.Dependencies, rawConf resource.Config, logger logging.Logger) (resource.Resource, error) {
	conf, err := resource.NativeConfig[*Config](rawConf)
	if err != nil {
		return nil, err
	}
	return NewDogController(ctx, deps, rawConf.ResourceName(), conf, logger)
}

// NewDogController creates a new dog controller that uses funBaseControl mode.
func NewDogController(ctx context.Context, deps resource.Dependencies, name resource.Name, conf *Config, logger logging.Logger) (resource.Resource, error) {
	cancelCtx, cancel := context.WithCancel(context.Background())

	s := &baseGamepadControllerDogController{
		name:        name,
		logger:      logger,
		cfg:         conf,
		cancelCtx:   cancelCtx,
		cancel:      cancel,
		events:      make(chan struct{}, 1),
		funCmdQueue: make(chan map[string]interface{}, 1),
	}
	s.state.init()

	base1, err := base.FromDependencies(deps, conf.BaseName)
	if err != nil {
		cancel()
		return nil, err
	}
	controller, err := input.FromDependencies(deps, conf.InputControllerName)
	if err != nil {
		cancel()
		return nil, err
	}

	s.mu.Lock()
	s.base = base1
	s.inputController = controller
	s.mu.Unlock()

	if err := s.registerCallbacks(ctx); err != nil {
		cancel()
		return nil, errors.Errorf("error starting base gamepad controller: %q", err)
	}
	s.eventProcessor()

	return s, nil
}

func (s *baseGamepadControllerDogController) Name() resource.Name {
	return s.name
}

// controllerInputs returns the list of inputs being monitored.
// The joystick axes always drive the base; any configured fun_commands controls are also monitored.
func (s *baseGamepadControllerDogController) controllerInputs() []input.Control {
	s.mu.RLock()
	defer s.mu.RUnlock()
	controls := []input.Control{input.AbsoluteX, input.AbsoluteY, input.AbsoluteRX, input.AbsoluteRY}
	for k := range s.cfg.FunCommands {
		controls = append(controls, input.Control(k))
	}
	return controls
}

// registerCallbacks registers event callbacks on the input controller.
func (s *baseGamepadControllerDogController) registerCallbacks(ctx context.Context) error {
	var lastTS time.Time
	lastTSPerEvent := map[input.Control]map[input.EventType]time.Time{}
	var onlyOneAtATime sync.Mutex

	instance := s.instance.Load()

	updateLastEvent := func(event input.Event) bool {
		if event.Time.After(lastTS) {
			lastTS = event.Time
		}
		if event.Time.Before(lastTSPerEvent[event.Control][event.Event]) {
			return false
		}
		lastTSPerEventControl := lastTSPerEvent[event.Control]
		if lastTSPerEventControl == nil {
			lastTSPerEventControl = map[input.EventType]time.Time{}
			lastTSPerEvent[event.Control] = lastTSPerEventControl
		}
		lastTSPerEventControl[event.Event] = event.Time
		return true
	}

	remoteCtl := func(ctx context.Context, event input.Event) {
		onlyOneAtATime.Lock()
		defer onlyOneAtATime.Unlock()

		if s.instance.Load() != instance {
			return
		}
		if s.cancelCtx.Err() != nil {
			return
		}
		if !updateLastEvent(event) {
			return
		}
		s.processEvent(ctx, &s.state, event)
	}

	connect := func(ctx context.Context, event input.Event) {
		onlyOneAtATime.Lock()
		defer onlyOneAtATime.Unlock()

		if s.instance.Load() != instance {
			return
		}
		// Connect and Disconnect events should both stop the base completely.
		s.mu.RLock()
		defer s.mu.RUnlock()
		if err := s.base.Stop(ctx, map[string]interface{}{}); err != nil {
			s.logger.CError(ctx, err)
		}
		if !updateLastEvent(event) {
			return
		}
	}

	inputs := s.controllerInputs()

	for _, control := range inputs {
		if err := func() error {
			s.mu.RLock()
			defer s.mu.RUnlock()

			eventTypes := []input.EventType{input.PositionChangeAbs}
			if strings.HasPrefix(string(control), "Button") {
				eventTypes = []input.EventType{input.ButtonChange}
			}

			if err := s.inputController.RegisterControlCallback(
				ctx, control, eventTypes, remoteCtl, map[string]interface{}{},
			); err != nil {
				return err
			}
			return s.inputController.RegisterControlCallback(
				ctx, control, []input.EventType{input.Connect, input.Disconnect}, connect, map[string]interface{}{},
			)
		}(); err != nil {
			return err
		}
	}
	return nil
}

func (s *baseGamepadControllerDogController) eventProcessor() {
	var currentLinear, currentAngular r3.Vector
	var nextLinear, nextAngular r3.Vector
	var inRetry bool

	s.activeBackgroundWorkers.Add(1)
	vutils.ManagedGo(func() {
		for {
			if s.cancelCtx.Err() != nil {
				return
			}

			if inRetry {
				select {
				case <-s.cancelCtx.Done():
				case <-s.events:
				default:
				}
			} else {
				select {
				case <-s.cancelCtx.Done():
				case <-s.events:
				}
			}

			s.state.mu.Lock()
			nextLinear, nextAngular = s.state.linearThrottle, s.state.angularThrottle
			s.state.mu.Unlock()

			if func() bool {
				s.mu.RLock()
				defer s.mu.RUnlock()

				if currentLinear != nextLinear || currentAngular != nextAngular {
					if s.cfg.MaxAngularVelocity > 0 && s.cfg.MaxLinearVelocity > 0 {
						if err := s.base.SetVelocity(
							s.cancelCtx,
							r3.Vector{
								X: s.cfg.MaxLinearVelocity * nextLinear.X,
								Y: s.cfg.MaxLinearVelocity * nextLinear.Y,
								Z: s.cfg.MaxLinearVelocity * nextLinear.Z,
							},
							r3.Vector{
								X: s.cfg.MaxAngularVelocity * nextAngular.X,
								Y: s.cfg.MaxAngularVelocity * nextAngular.Y,
								Z: s.cfg.MaxAngularVelocity * nextAngular.Z,
							},
							nil,
						); err != nil {
							s.logger.Errorw("error setting velocity", "error", err)
							if !vutils.SelectContextOrWait(s.cancelCtx, 10*time.Millisecond) {
								return true
							}
							inRetry = true
							return false
						}
					} else {
						if err := s.base.SetPower(s.cancelCtx, nextLinear, nextAngular, nil); err != nil {
							s.logger.Errorw("error setting power", "error", err)
							if !vutils.SelectContextOrWait(s.cancelCtx, 10*time.Millisecond) {
								return true
							}
							inRetry = true
							return false
						}
					}
					inRetry = false
					currentLinear = nextLinear
					currentAngular = nextAngular
				}
				return false
			}() {
				return
			}

			select {
			case cmd := <-s.funCmdQueue:
				s.mu.RLock()
				if _, err := s.base.DoCommand(s.cancelCtx, cmd); err != nil {
					s.logger.Errorw("error executing fun command", "error", err)
				}
				s.mu.RUnlock()
			default:
			}
		}
	}, s.activeBackgroundWorkers.Done)
}

func (s *baseGamepadControllerDogController) processEvent(ctx context.Context, state *throttleState, event input.Event) {
	state.mu.Lock()
	oldLinear := state.linearThrottle
	oldAngular := state.angularThrottle
	newLinear := oldLinear
	newAngular := oldAngular

	s.mu.RLock()
	defer s.mu.RUnlock()

	switch event.Control {
	case input.AbsoluteX, input.AbsoluteY, input.AbsoluteRX, input.AbsoluteRY:
		newLinear, newAngular = funBaseEvent(event, state.linearThrottle, state.angularThrottle, s.cfg.deadZone())
	case input.AbsoluteHat0X, input.AbsoluteHat0Y, input.AbsoluteRZ, input.AbsoluteZ, input.ButtonEStop,
		input.ButtonLT, input.ButtonLT2, input.ButtonLThumb, input.ButtonMenu,
		input.ButtonNorth, input.ButtonSouth, input.ButtonEast, input.ButtonWest,
		input.ButtonRT, input.ButtonRT2, input.ButtonRThumb, input.ButtonRecord, input.ButtonSelect,
		input.ButtonStart, input.AbsolutePedalAccelerator,
		input.AbsolutePedalBrake, input.AbsolutePedalClutch:
		if funCmd, ok := s.cfg.FunCommands[string(event.Control)]; ok {
			expectedEventType := input.EventType(funCmd.EventType)
			if expectedEventType == "" {
				expectedEventType = defaultEventType(event.Control)
			}
			if event.Event != expectedEventType {
				s.logger.Debugw("fun command event type mismatch", "control", event.Control, "expected", expectedEventType, "got", event.Event)
			} else {
				scale := funCmd.ValueScale
				if scale == 0 {
					scale = 1.0
				}
				cmdInput := substituteValue(funCmd.DoCommandInput, event.Value*scale)
				select {
				case s.funCmdQueue <- map[string]interface{}{funCmd.Command: cmdInput}:
				default:
					s.logger.Warnw("fun command queue full, dropping command")
				}
			}
		} else {
		}
		fallthrough
	default:
		newLinear = oldLinear
		newAngular = oldAngular
	}

	state.linearThrottle = newLinear
	state.angularThrottle = newAngular
	state.mu.Unlock()

	if similar(newLinear, oldLinear, s.cfg.denoiseThreshold()) && similar(newAngular, oldAngular, s.cfg.denoiseThreshold()) && len(s.funCmdQueue) == 0 {
		s.logger.Debugw("skipping event signal, no changes", "control", event.Control)
		return
	}
	s.logger.Debugw("signaling event processor", "control", event.Control, "funCmdQueueLen", len(s.funCmdQueue))

	select {
	case <-ctx.Done():
	case s.events <- struct{}{}:
	default:
	}

	session.SafetyMonitor(ctx, s.base)
}

// substituteValue recursively walks input and replaces any string "$value" with value.
// This allows "$value" to appear inside nested maps or slices in a fun_command's input field.
func substituteValue(input interface{}, value float64) interface{} {
	switch v := input.(type) {
	case string:
		if v == "$value" {
			return value
		}
		return v
	case map[string]interface{}:
		out := make(map[string]interface{}, len(v))
		for k, val := range v {
			out[k] = substituteValue(val, value)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(v))
		for i, val := range v {
			out[i] = substituteValue(val, value)
		}
		return out
	default:
		return input
	}
}

// defaultEventType returns the expected event type for a control based on its name prefix.
// Button controls default to ButtonPress; absolute controls default to PositionChangeAbs.
func defaultEventType(control input.Control) input.EventType {
	if strings.HasPrefix(string(control), "Button") {
		return input.ButtonPress
	}
	return input.PositionChangeAbs
}

// funBaseEvent maps joystick axes to linear/angular vectors.
// Left stick (AbsoluteX/Y) → linear X/Y; right stick (AbsoluteRX/RY) → angular Z/X.
func funBaseEvent(event input.Event, linear, angular r3.Vector, deadZone float64) (r3.Vector, r3.Vector) {
	switch event.Control {
	case input.AbsoluteX:
		linear.X = scaleThrottle(-1.0*event.Value, deadZone)
	case input.AbsoluteY:
		linear.Y = scaleThrottle(-1.0*event.Value, deadZone)
	case input.AbsoluteRX:
		angular.Z = scaleThrottle(-1.0*event.Value, deadZone)
	case input.AbsoluteRY:
		angular.X = scaleThrottle(-1.0*event.Value, deadZone)
	default:
	}
	return linear, angular
}

func similar(a, b r3.Vector, deltaThreshold float64) bool {
	return math.Abs(a.X-b.X) <= deltaThreshold &&
		math.Abs(a.Y-b.Y) <= deltaThreshold &&
		math.Abs(a.Z-b.Z) <= deltaThreshold
}

func scaleThrottle(a, deadZone float64) float64 {
	neg := a < 0
	a = math.Abs(a)
	if a <= deadZone {
		return 0
	}
	a = math.Ceil(a*10) / 10.0
	if neg {
		a *= -1
	}
	return a
}

type throttleState struct {
	mu                              sync.Mutex
	linearThrottle, angularThrottle r3.Vector
}

func (ts *throttleState) init() {}

func (s *baseGamepadControllerDogController) DoCommand(ctx context.Context, cmd map[string]interface{}) (map[string]interface{}, error) {
	resp := map[string]interface{}{}
	for key := range cmd {
		switch key {
		case "get_controller_inputs":
			controls := s.controllerInputs()
			names := make([]string, len(controls))
			for i, c := range controls {
				names[i] = string(c)
			}
			resp["controller_inputs"] = names
		default:
			return nil, errors.Errorf("unknown command: %s", key)
		}
	}
	return resp, nil
}

func (s *baseGamepadControllerDogController) Close(_ context.Context) error {
	s.cancel()
	s.activeBackgroundWorkers.Wait()
	return nil
}
