package main

import (
	"basegamepadcontroller"
	"go.viam.com/rdk/module"
	"go.viam.com/rdk/resource"
	generic "go.viam.com/rdk/services/generic"
)

func main() {
	// ModularMain can take multiple APIModel arguments, if your module implements multiple models.
	module.ModularMain(
		resource.APIModel{API: generic.API, Model: basegamepadcontroller.DogController},
		resource.APIModel{API: generic.API, Model: basegamepadcontroller.DogTTSCoodinator},
	)
}
