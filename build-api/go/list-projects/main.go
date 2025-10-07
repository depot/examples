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

	// Create the Project Service client
	client := corev1connect.NewProjectServiceClient(
		http.DefaultClient,
		"https://api.depot.dev",
	)

	// List all projects
	req := connect.NewRequest(&corev1.ListProjectsRequest{})

	// Add authentication header
	req.Header().Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := client.ListProjects(ctx, req)
	if err != nil {
		log.Fatalf("Failed to list projects: %v", err)
	}

	if len(resp.Msg.Projects) == 0 {
		fmt.Println("No projects found")
		return
	}

	fmt.Printf("Found %d project(s):\n\n", len(resp.Msg.Projects))
	for _, project := range resp.Msg.Projects {
		fmt.Printf("Project ID:       %s\n", project.ProjectId)
		fmt.Printf("Name:             %s\n", project.Name)
		fmt.Printf("Region:           %s\n", project.RegionId)
		fmt.Printf("Organization ID:  %s\n", project.OrganizationId)
		if project.CachePolicy != nil {
			fmt.Printf("Cache Policy:     %d GB, %d days\n",
				project.CachePolicy.KeepGb,
				project.CachePolicy.KeepDays)
		}
		fmt.Println()
	}
}
