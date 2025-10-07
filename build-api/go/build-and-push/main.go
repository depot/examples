package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/depot/depot-go/build"
	"github.com/depot/depot-go/machine"
	cliv1 "github.com/depot/depot-go/proto/depot/cli/v1"
	"github.com/docker/cli/cli/config"
	"github.com/moby/buildkit/client"
	"github.com/moby/buildkit/session"
	"github.com/moby/buildkit/session/auth/authprovider"
)

func main() {
	ctx := context.Background()

	token := os.Getenv("DEPOT_TOKEN")
	projectID := os.Getenv("DEPOT_PROJECT_ID")

	if token == "" || projectID == "" {
		log.Fatal("DEPOT_TOKEN and DEPOT_PROJECT_ID environment variables are required")
	}

	// Get image tag from command line or use default
	imageTag := "docker.io/myuser/myapp:latest"
	if len(os.Args) > 1 {
		imageTag = os.Args[1]
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

	fmt.Printf("Build registered: %s\n", b.ID)

	// 2. Acquire builder machine
	buildkit, buildErr := machine.Acquire(ctx, b.ID, b.Token, "arm64")
	if buildErr != nil {
		log.Printf("Failed to acquire builder: %v\n", buildErr)
		return
	}
	defer buildkit.Release()

	fmt.Println("Builder acquired")

	// 3. Connect to BuildKit
	buildkitClient, buildErr := buildkit.Connect(ctx)
	if buildErr != nil {
		log.Printf("Failed to connect to BuildKit: %v\n", buildErr)
		return
	}

	fmt.Println("Connected to BuildKit")

	// 4. Configure authentication
	// Option 1: Use docker login credentials (default)
	authProvider := authprovider.NewDockerAuthProvider(config.LoadDefaultConfigFile(os.Stderr), nil)

	// Option 2: Provide credentials programmatically (uncomment and add imports to use)
	// See: github.com/docker/cli/cli/config/configfile and github.com/docker/cli/cli/config/types
	// username := os.Getenv("DOCKERHUB_USERNAME")
	// password := os.Getenv("DOCKERHUB_TOKEN")
	// authProvider = authprovider.NewDockerAuthProvider(&configfile.ConfigFile{
	// 	AuthConfigs: map[string]types.AuthConfig{
	// 		"https://index.docker.io/v1/": {Username: username, Password: password},
	// 	},
	// }, nil)

	// 5. Configure build with push
	solverOptions := client.SolveOpt{
		Frontend: "dockerfile.v0",
		FrontendAttrs: map[string]string{
			"filename": "Dockerfile",
			"platform": "linux/arm64",
		},
		LocalDirs: map[string]string{
			"dockerfile": "..",
			"context":    "..",
		},
		Exports: []client.ExportEntry{
			{
				Type: "image",
				Attrs: map[string]string{
					"name":           imageTag,
					"oci-mediatypes": "true",
					"push":           "true",
				},
			},
		},
		Session: []session.Attachable{
			authProvider,
		},
	}

	// 6. Stream build output
	buildStatusCh := make(chan *client.SolveStatus, 10)
	go func() {
		enc := json.NewEncoder(os.Stdout)
		for status := range buildStatusCh {
			_ = enc.Encode(status)
		}
	}()

	// 7. Execute build and push
	fmt.Printf("Building and pushing to %s...\n", imageTag)
	_, buildErr = buildkitClient.Solve(ctx, nil, solverOptions, buildStatusCh)
	if buildErr != nil {
		log.Printf("Build failed: %v\n", buildErr)
		return
	}

	fmt.Printf("Successfully built and pushed %s!\n", imageTag)
}
