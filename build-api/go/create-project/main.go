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

	// Get project name from command line or use default
	projectName := "my-project"
	if len(os.Args) > 1 {
		projectName = os.Args[1]
	}

	// Create the Project Service client
	client := corev1connect.NewProjectServiceClient(
		http.DefaultClient,
		"https://api.depot.dev",
	)

	// Create a new project
	req := connect.NewRequest(&corev1.CreateProjectRequest{
		Name:     projectName,
		RegionId: "us-east-1",
		CachePolicy: &corev1.CachePolicy{
			KeepGb:   50, // 50GB
			KeepDays: 14, // 14 days
		},
	})

	// Add authentication header
	req.Header().Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := client.CreateProject(ctx, req)
	if err != nil {
		log.Fatalf("Failed to create project: %v", err)
	}

	log.Printf("Project created successfully!")
	log.Printf("Project ID:       %s", resp.Msg.Project.ProjectId)
	log.Printf("Name:             %s", resp.Msg.Project.Name)
	log.Printf("Region:           %s", resp.Msg.Project.RegionId)
	log.Printf("Organization ID:  %s", resp.Msg.Project.OrganizationId)
	if resp.Msg.Project.CachePolicy != nil {
		log.Printf("Cache Policy:     %d GB, %d days",
			resp.Msg.Project.CachePolicy.KeepGb,
			resp.Msg.Project.CachePolicy.KeepDays)
	}
	log.Printf("Save the Project ID to use in builds: %s", resp.Msg.Project.ProjectId)
}
