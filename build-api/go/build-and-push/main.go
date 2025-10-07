package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/depot/depot-go/build"
	"github.com/depot/depot-go/machine"
	cliv1 "github.com/depot/depot-go/proto/depot/cli/v1"
	"github.com/docker/cli/cli/config"
	"github.com/docker/cli/cli/config/configfile"
	"github.com/docker/cli/cli/config/types"
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

	// 4. Configure authentication
	var authProvider session.Attachable

	// Check if programmatic credentials are provided via environment variables
	username := os.Getenv("REGISTRY_USERNAME")
	password := os.Getenv("REGISTRY_PASSWORD")
	registryURL := os.Getenv("REGISTRY_URL")

	if username != "" && password != "" {
		// Use programmatic credentials
		if registryURL == "" {
			registryURL = "https://index.docker.io/v1/" // Default to Docker Hub
		}
		log.Printf("Using programmatic authentication")
		authProvider = authprovider.NewDockerAuthProvider(&configfile.ConfigFile{
			AuthConfigs: map[string]types.AuthConfig{
				registryURL: {
					Username: username,
					Password: password,
				},
			},
		}, nil)
	} else {
		// Use docker login credentials (from ~/.docker/config.json)
		log.Printf("Using docker login credentials")
		authProvider = authprovider.NewDockerAuthProvider(config.LoadDefaultConfigFile(os.Stderr), nil)
	}

	// 5. Configure build with push
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
	log.Printf("Building and pushing to %s...", imageTag)
	_, buildErr = buildkitClient.Solve(ctx, nil, solverOptions, buildStatusCh)
	if buildErr != nil {
		log.Printf("Build failed: %v", buildErr)
		return
	}

	log.Printf("Successfully built and pushed %s!", imageTag)
}
