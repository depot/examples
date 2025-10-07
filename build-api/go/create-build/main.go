package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/depot/depot-go/build"
	"github.com/depot/depot-go/machine"
	cliv1 "github.com/depot/depot-go/proto/depot/cli/v1"
	"github.com/moby/buildkit/client"
)

func main() {
	ctx := context.Background()

	token := os.Getenv("DEPOT_TOKEN")
	projectID := os.Getenv("DEPOT_PROJECT_ID")

	if token == "" || projectID == "" {
		log.Fatal("DEPOT_TOKEN and DEPOT_PROJECT_ID environment variables are required")
	}

	// 1. Register build
	b, err := build.NewBuild(ctx, &cliv1.CreateBuildRequest{
		ProjectId: projectID,
	}, token)
	if err != nil {
		log.Fatal(err)
	}

	var buildErr error
	defer b.Finish(buildErr)

	log.Printf("Build registered: %s", b.ID)

	// 2. Acquire builder machine
	buildkit, buildErr := machine.Acquire(ctx, b.ID, b.Token, "arm64")
	if buildErr != nil {
		log.Printf("Failed to acquire builder: %v", buildErr)
		return
	}
	defer buildkit.Release()

	log.Printf("Builder acquired")

	// 3. Connect to BuildKit
	buildkitClient, buildErr := buildkit.Connect(ctx)
	if buildErr != nil {
		log.Printf("Failed to connect to BuildKit: %v", buildErr)
		return
	}

	log.Printf("Connected to BuildKit")

	// 4. Configure build (no push, just build)
	solverOptions := client.SolveOpt{
		Frontend: "dockerfile.v0",
		FrontendAttrs: map[string]string{
			"filename": "Dockerfile",
			"platform": "linux/arm64",
		},
		LocalDirs: map[string]string{
			"dockerfile": ".",
			"context":    ".",
		},
	}

	// 5. Stream build output
	buildStatusCh := make(chan *client.SolveStatus, 10)
	go func() {
		enc := json.NewEncoder(os.Stdout)
		for status := range buildStatusCh {
			_ = enc.Encode(status)
		}
	}()

	// 6. Execute build
	log.Printf("Starting build...")
	_, buildErr = buildkitClient.Solve(ctx, nil, solverOptions, buildStatusCh)
	if buildErr != nil {
		log.Printf("Build failed: %v", buildErr)
		return
	}

	log.Printf("Build completed successfully!")
}
