package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/depot/depot-go/build"
	cliv1 "github.com/depot/depot-go/proto/depot/cli/v1"
)

func main() {
	ctx := context.Background()

	token := os.Getenv("DEPOT_TOKEN")
	if token == "" {
		log.Fatal("DEPOT_TOKEN environment variable is required")
	}

	// Get project ID from command line
	if len(os.Args) < 2 {
		log.Fatal("Usage: go run main.go <project-id>")
	}
	projectID := os.Args[1]

	// Delete the project
	_, err := build.DeleteProject(ctx, &cliv1.DeleteProjectRequest{
		ProjectId: projectID,
	}, token)
	if err != nil {
		log.Fatalf("Failed to delete project: %v", err)
	}

	fmt.Printf("Project %s deleted successfully\n", projectID)
}
