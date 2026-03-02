package basegamepadcontroller

import (
	"context"
	"errors"
	"fmt"
	"image"
	"sync"
	"time"

	"go.viam.com/rdk/components/audioin"
	"go.viam.com/rdk/components/audioout"
	"go.viam.com/rdk/components/base"
	"go.viam.com/rdk/components/camera"
	"go.viam.com/rdk/components/input"
	"go.viam.com/rdk/logging"
	"go.viam.com/rdk/resource"
	genericservice "go.viam.com/rdk/services/generic"
	"go.viam.com/rdk/services/vision"
	vutils "go.viam.com/utils"
)

var (
	DogTTSCoodinator = resource.NewModel("cjnj193", "dog-gamepad", "dog-tts-coodinator")
	errUnimplemented = errors.New("unimplemented")
)

func init() {
	resource.RegisterService(genericservice.API, DogTTSCoodinator,
		resource.Registration[resource.Resource, *TTSCoordinatorConfig]{
			Constructor: newTTSCoordinatorService,
		},
	)
}

type TTSCoordinatorConfig struct {
	Base      string `json:"base"`
	Camera    string `json:"camera"`
	AudioOut  string `json:"audio_out"`
	Gesture   string `json:"gesture"`
	People    string `json:"people"`
	FilterMic string `json:"filter_mic"`
}

func requireDep(path, attr, val string, deps *[]string) error {
	if val == "" {
		return fmt.Errorf("%s: attribute '%s' (non-empty string) is required", path, attr)
	}
	*deps = append(*deps, val)
	return nil
}

func (cfg *TTSCoordinatorConfig) Validate(path string) ([]string, []string, error) {
	var deps []string
	for _, entry := range []struct{ attr, val string }{
		{"base", cfg.Base},
		{"camera", cfg.Camera},
		{"audio_out", cfg.AudioOut},
		{"gesture", cfg.Gesture},
		{"people", cfg.People},
		{"filter-mic", cfg.FilterMic},
	} {
		if err := requireDep(path, entry.attr, entry.val, &deps); err != nil {
			return nil, nil, err
		}
	}
	return deps, nil, nil
}

type ttsCoodinatorService struct {
	resource.AlwaysRebuild

	name resource.Name

	logger logging.Logger
	cfg    *TTSCoordinatorConfig

	cancelCtx  context.Context
	cancelFunc func()

	base             base.Base
	camera           camera.Camera
	input_controller input.Controller
	audio_out        audioout.AudioOut
	gestureVis       vision.Service
	peopleVis        vision.Service
	filter_mic       audioin.AudioIn

	searchMu     sync.Mutex
	searchCancel context.CancelFunc

	workers *vutils.StoppableWorkers
}

func newTTSCoordinatorService(ctx context.Context, deps resource.Dependencies, rawConf resource.Config, logger logging.Logger) (resource.Resource, error) {
	conf, err := resource.NativeConfig[*TTSCoordinatorConfig](rawConf)
	if err != nil {
		return nil, err
	}

	return NewTTSCoordinatorService(ctx, deps, rawConf.ResourceName(), conf, logger)
}

func NewTTSCoordinatorService(ctx context.Context, deps resource.Dependencies, name resource.Name, conf *TTSCoordinatorConfig, logger logging.Logger) (resource.Resource, error) {
	cancelCtx, cancelFunc := context.WithCancel(context.Background())

	baseDep, err := base.FromProvider(deps, conf.Base)
	if err != nil {
		return nil, err
	}

	cameraDep, err := camera.FromProvider(deps, conf.Camera)
	if err != nil {
		return nil, err
	}

	audio_outDep, err := audioout.FromProvider(deps, conf.AudioOut)
	if err != nil {
		return nil, err
	}

	gesture, err := vision.FromProvider(deps, conf.Gesture)
	if err != nil {
		return nil, err
	}

	people, err := vision.FromProvider(deps, conf.People)
	if err != nil {
		return nil, err
	}

	filtermic, err := audioin.FromProvider(deps, conf.FilterMic)
	if err != nil {
		return nil, err
	}

	s := &ttsCoodinatorService{
		name:       name,
		logger:     logger,
		cfg:        conf,
		cancelCtx:  cancelCtx,
		cancelFunc: cancelFunc,
		base:       baseDep,
		camera:     cameraDep,
		audio_out:  audio_outDep,
		gestureVis: gesture,
		peopleVis:  people,
		filter_mic: filtermic,
	}

	s.workers = vutils.NewBackgroundStoppableWorkers(s.audio_thread)

	return s, nil
}

// getCameraImage returns the first image from the camera.
func (s *ttsCoodinatorService) getCameraImage(ctx context.Context) (image.Image, error) {
	imgs, _, err := s.camera.Images(ctx, []string{}, nil)
	if err != nil {
		return nil, err
	}
	return imgs[0].Image(ctx)
}

// setPose sends a pose command to the base.
func (s *ttsCoodinatorService) setPose(ctx context.Context, pitch, roll, yaw int) error {
	_, err := s.base.DoCommand(ctx, map[string]interface{}{
		"pose": map[string]interface{}{
			"pitch_deg": pitch,
			"roll_deg":  roll,
			"yaw_deg":   yaw,
		},
	})
	return err
}

// detectFirstPerson returns the label of the first detected person from the camera, or "" if none.
func (s *ttsCoodinatorService) detectFirstPerson(ctx context.Context) (string, error) {
	detections, err := s.peopleVis.DetectionsFromCamera(ctx, s.cfg.Camera, nil)
	if err != nil {
		return "", fmt.Errorf("error getting detections: %w", err)
	}
	if len(detections) > 0 {
		return detections[0].Label(), nil
	}
	return "", nil
}

// detectAndGreet detects the first person in frame and greets them if they are known.
// Returns true if someone was greeted.
func (s *ttsCoodinatorService) detectAndGreet(ctx context.Context) (bool, error) {
	who, err := s.detectFirstPerson(ctx)
	if err != nil {
		return false, err
	}
	if who != "" && who != "unknown" {
		return true, s.sayWithGesture(ctx, who)
	}
	return false, nil
}

func (s *ttsCoodinatorService) control_thread(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	var lastGestureTime time.Time
	recentNames := map[string]time.Time{}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// expire names older than 10 seconds
			for name, t := range recentNames {
				if time.Since(t) >= 10*time.Second {
					delete(recentNames, name)
				}
			}

			img, err := s.getCameraImage(ctx)
			if err != nil {
				s.logger.Error(err)
				continue
			}

			detections, _ := s.peopleVis.Detections(ctx, img, nil)
			who := ""
			if len(detections) > 0 {
				who = detections[0].Label()
			}

			if who != "" && who != "unknown" {
				if _, alreadySaid := recentNames[who]; !alreadySaid {
					if err := s.say(ctx, who); err != nil {
						s.logger.Error(err)
						continue
					}
					recentNames[who] = time.Now()
				}
			}

			if time.Since(lastGestureTime) >= 10*time.Second {
				s.logger.Debug("checking gestures")
				found, err := s.checkGesture(ctx, img)
				if err != nil {
					s.logger.Error(err)
				} else if found {
					lastGestureTime = time.Now()
				}
			}
		}
	}
}

func (s *ttsCoodinatorService) checkGesture(ctx context.Context, img image.Image) (bool, error) {
	classifications, err := s.gestureVis.Classifications(ctx, img, 1, nil)
	if err != nil {
		return false, fmt.Errorf("gesture classification error: %w", err)
	}
	for _, c := range classifications {
		if c.Label() == "Pointing_Down" {
			_, err := s.base.DoCommand(ctx, map[string]interface{}{"sit": true})
			if err != nil {
				return false, fmt.Errorf("base DoCommand 'hello' error: %w", err)
			}
			s.logger.Info("Pointing_down detected — sent 'sit' to base")
			return true, nil
		}
		if c.Label() == "Open_Palm" {
			_, err := s.base.DoCommand(ctx, map[string]interface{}{"hello": true})
			if err != nil {
				return false, fmt.Errorf("base DoCommand 'hello' error: %w", err)
			}
			_, err = s.audio_out.DoCommand(ctx, map[string]interface{}{"speak": "hello"})
			if err != nil {
				return false, fmt.Errorf("audio_out speak 'hello' error: %w", err)
			}
			s.logger.Info("Open_Palm detected — sent 'hello' to base")
			return true, nil
		}
	}
	return false, nil
}

func (s *ttsCoodinatorService) say(ctx context.Context, name string) error {
	_, err := s.audio_out.DoCommand(ctx, map[string]interface{}{"speak": name})
	if err != nil {
		return fmt.Errorf("speak error: %w", err)
	}
	return nil
}

func (s *ttsCoodinatorService) findSomeone(ctx context.Context, name string) error {
	spinIncrement := 15
	spinCount := 360 / spinIncrement
	poses := [][3]int{{-60, 0, 0}, {-60, 0, 15}, {-60, 0, 15}, {-60, 0, -15}}

outer:
	for {
		if err := s.base.Spin(ctx, float64(spinIncrement), 60, nil); err != nil {
			return fmt.Errorf("spin error: %w", err)
		}

		who, err := s.detectFirstPerson(ctx)
		if err != nil {
			return err
		}
		if who == name {
			break
		}

		for _, p := range poses {
			if err := s.setPose(ctx, p[0], p[1], p[2]); err != nil {
				return fmt.Errorf("pose error: %w", err)
			}
			who, err = s.detectFirstPerson(ctx)
			if err != nil {
				return err
			}
			if who == name {
				break outer
			}
		}

		spinCount--
		if spinCount == 0 {
			break
		}
	}
	return nil
}

func (s *ttsCoodinatorService) greetFirstSeen(ctx context.Context) error {
	spinIncrement := 30
	spinCount := 360 / spinIncrement
	poses := [][3]int{{-60, 0, 0}, {-60, 0, 20}, {-60, 0, -20}}

	for {
		s.logger.Infof("spin increment: %d ", spinIncrement)
		if err := s.base.Spin(ctx, float64(spinIncrement*2), 60, nil); err != nil {
			return fmt.Errorf("spin error: %w", err)
		}
		time.Sleep(2 * time.Second)

		found, err := s.detectAndGreet(ctx)
		if err != nil {
			return err
		}
		if found {
			return nil
		}

		for _, p := range poses {
			if err := s.setPose(ctx, p[0], p[1], p[2]); err != nil {
				return fmt.Errorf("pose error: %w", err)
			}
			time.Sleep(2 * time.Second)
			found, err = s.detectAndGreet(ctx)
			if err != nil {
				return err
			}
			if found {
				return nil
			}
		}

		if err := s.setPose(ctx, 0, 0, 0); err != nil {
			return fmt.Errorf("pose error: %w", err)
		}
		time.Sleep(2 * time.Second)
		spinCount--
		if spinCount == 0 {
			break
		}
	}

	return s.say(ctx, "could not find you, sorry!")
}

func (s *ttsCoodinatorService) sayWithGesture(ctx context.Context, who string) error {
	if err := s.say(ctx, fmt.Sprintf("hi %s", who)); err != nil {
		return err
	}

	time.Sleep(2 * time.Second)

	img, err := s.getCameraImage(ctx)
	if err != nil {
		s.logger.Error(err)
		return err
	}

	if _, err = s.checkGesture(ctx, img); err != nil {
		s.logger.Error(err)
		return err
	}

	return nil
}

func (s *ttsCoodinatorService) audio_thread(ctx context.Context) {
	ch, err := s.filter_mic.GetAudio(ctx, "pcm16", 0, 0, nil)
	if err != nil {
		s.logger.Errorf("failed to open mic stream: %v", err)
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case chunk, ok := <-ch:
			if !ok {
				s.logger.Info("audio channel closed")
				return
			}
			s.logger.Info("tts coordinator got chunk")
			if len(chunk.AudioData) == 0 {
				// empty audio data = end of speech segment, greet whoever we see
				searchCtx := s.startSearch(ctx)
				if err := s.greetFirstSeen(searchCtx); err != nil && searchCtx.Err() == nil {
					s.logger.Error(err)
				}
				if err := s.setPose(ctx, 0, 0, 0); err != nil {
					s.logger.Error(err)
				}
			}
		}
	}
}

// startSearch cancels any in-progress search and returns a new context for the next one.
func (s *ttsCoodinatorService) startSearch(parent context.Context) context.Context {
	s.searchMu.Lock()
	defer s.searchMu.Unlock()
	if s.searchCancel != nil {
		s.searchCancel()
	}
	ctx, cancel := context.WithCancel(parent)
	s.searchCancel = cancel
	return ctx
}

// cancelSearch cancels any in-progress search.
func (s *ttsCoodinatorService) cancelSearch() {
	s.searchMu.Lock()
	defer s.searchMu.Unlock()
	if s.searchCancel != nil {
		s.searchCancel()
		s.searchCancel = nil
	}
}

func (s *ttsCoodinatorService) Name() resource.Name {
	return s.name
}

func (s *ttsCoodinatorService) DoCommand(ctx context.Context, cmd map[string]interface{}) (map[string]interface{}, error) {
	if say, ok := cmd["say_this"].(string); ok {
		if err := s.say(ctx, say); err != nil {
			return nil, err
		}
	}

	if _, ok := cmd["cancel"]; ok {
		s.cancelSearch()
	}

	if name, ok := cmd["find"].(string); ok {
		searchCtx := s.startSearch(ctx)
		if err := s.findSomeone(searchCtx, name); err != nil && searchCtx.Err() == nil {
			return nil, err
		}
		if searchCtx.Err() == nil {
			if err := s.say(ctx, fmt.Sprintf("hi %s", name)); err != nil {
				return nil, err
			}
		}
	}
	return map[string]interface{}{"result": "docommand called"}, nil
}

func (s *ttsCoodinatorService) Close(context.Context) error {
	s.cancelFunc()
	if s.workers != nil {
		s.workers.Stop()
	}
	return nil
}
