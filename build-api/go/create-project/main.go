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

	// Get project name from command line or use default
	projectName := "my-project"
	if len(os.Args) > 1 {
		projectName = os.Args[1]
	}

	// Create a new project
	resp, err := build.CreateProject(ctx, &cliv1.CreateProjectRequest{
		Name:     projectName,
		RegionId: "us-east-1",
		CachePolicy: &cliv1.CachePolicy{
			KeepBytes: 50 * 1024 * 1024 * 1024, // 50GB
			KeepDays:  14,                       // 14 days
		},
	}, token)
	if err != nil {
		log.Fatalf("Failed to create project: %v", err)
	}

	fmt.Println("Project created successfully!")
	fmt.Printf("\nProject ID:       %s\n", resp.Project.ProjectId)
	fmt.Printf("Name:             %s\n", resp.Project.Name)
	fmt.Printf("Region:           %s\n", resp.Project.RegionId)
	fmt.Printf("Organization ID:  %s\n", resp.Project.OrganizationId)
	if resp.Project.CachePolicy != nil {
		fmt.Printf("Cache Policy:     %d GB, %d days\n",
			resp.Project.CachePolicy.KeepBytes/(1024*1024*1024),
			resp.Project.CachePolicy.KeepDays)
	}
	fmt.Printf("\nSave the Project ID to use in builds: %s\n", resp.Project.ProjectId)
}
