package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	corev1 "buf.build/gen/go/depot/api/protocolbuffers/go/depot/core/v1"
	"buf.build/gen/go/depot/api/connectrpc/go/depot/core/v1/corev1connect"
	"connectrpc.com/connect"
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

	// Create the Project Service client
	client := corev1connect.NewProjectServiceClient(
		http.DefaultClient,
		"https://api.depot.dev",
	)

	// Delete the project
	req := connect.NewRequest(&corev1.DeleteProjectRequest{
		ProjectId: projectID,
	})

	// Add authentication header
	req.Header().Set("Authorization", fmt.Sprintf("Bearer %s", token))

	_, err := client.DeleteProject(ctx, req)
	if err != nil {
		log.Fatalf("Failed to delete project: %v", err)
	}

	fmt.Printf("Project %s deleted successfully!\n", projectID)
}
