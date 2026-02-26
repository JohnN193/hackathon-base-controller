package basegamepadcontroller

import (
	"context"
	"errors"
	"fmt"
	"time"

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
	DogTTSCoodinator = resource.NewModel("cjnj193", "dog-coordinator", "dog-tts-coodinator")
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
	Base     string `json:"base"`
	Camera   string `json:"camera"`
	AudioOut string `json:"audio_out"`
	Gesture  string `json:"gesture"`
	People   string `json:"people"`
}

func (cfg *TTSCoordinatorConfig) Validate(path string) ([]string, []string, error) {
	requiredDeps := []string{}
	optionalDeps := []string{}

	if cfg.Base == "" {
		return nil, nil, fmt.Errorf(
			"%s: attribute 'base' (non-empty string) is required",
			path,
		)
	}
	requiredDeps = append(requiredDeps, cfg.Base)

	if cfg.Camera == "" {
		return nil, nil, fmt.Errorf(
			"%s: attribute 'camera' (non-empty string) is required",
			path,
		)
	}
	requiredDeps = append(requiredDeps, cfg.Camera)

	if cfg.AudioOut == "" {
		return nil, nil, fmt.Errorf(
			"%s: attribute 'audio_out' (non-empty string) is required",
			path,
		)
	}
	requiredDeps = append(requiredDeps, cfg.AudioOut)

	if cfg.Gesture == "" {
		return nil, nil, fmt.Errorf(
			"%s: attribute 'gesture' (non-empty string) is required",
			path,
		)
	}
	requiredDeps = append(requiredDeps, cfg.Gesture)

	if cfg.People == "" {
		return nil, nil, fmt.Errorf(
			"%s: attribute 'people' (non-empty string) is required",
			path,
		)
	}
	requiredDeps = append(requiredDeps, cfg.People)

	return requiredDeps, optionalDeps, nil
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

	people, err := vision.FromProvider(deps, conf.Gesture)
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
	}

	s.workers = vutils.NewBackgroundStoppableWorkers(s.control_thread)

	return s, nil
}

func (s *ttsCoodinatorService) control_thread(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			imgs, _, err := s.camera.Images(ctx, []string{}, nil)
			if err != nil {
				s.logger.Error(err)
				continue
			}
			img, err := imgs[0].Image(ctx)
			if err != nil {
				s.logger.Error(err)
				continue
			}
			detections, err := s.peopleVis.Detections(ctx, img, nil)
			who := ""
			if len(detections) > 0 {
				who = detections[0].Label()
			}

			if who != "" {
				err := s.sayName(ctx, who)
				if err != nil {
					s.logger.Error(err)
					continue
				}
			}
		}
	}
}

func (s *ttsCoodinatorService) sayName(ctx context.Context, name string) error {
	_, err := s.audio_out.DoCommand(ctx, map[string]interface{}{"speak": name})
	if err != nil {
		return fmt.Errorf("speak error: %w", err)
	}
	return nil
}

func (s *ttsCoodinatorService) Name() resource.Name {
	return s.name
}

func (s *ttsCoodinatorService) DoCommand(ctx context.Context, cmd map[string]interface{}) (map[string]interface{}, error) {
	say, ok := cmd["say_this"].(string)
	if ok {
		err := s.sayName(ctx, say)
		if err != nil {
			return nil, err
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
