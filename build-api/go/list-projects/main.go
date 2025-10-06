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

	// List all projects in the organization
	resp, err := build.ListProjects(ctx, &cliv1.ListProjectsRequest{}, token)
	if err != nil {
		log.Fatalf("Failed to list projects: %v", err)
	}

	if len(resp.Projects) == 0 {
		fmt.Println("No projects found")
		return
	}

	fmt.Printf("Found %d project(s):\n\n", len(resp.Projects))
	for _, project := range resp.Projects {
		fmt.Printf("ID:         %s\n", project.ProjectId)
		fmt.Printf("Name:       %s\n", project.Name)
		fmt.Printf("Region:     %s\n", project.RegionId)
		if project.CachePolicy != nil {
			fmt.Printf("Cache:      %d GB, %d days\n",
				project.CachePolicy.KeepBytes/(1024*1024*1024),
				project.CachePolicy.KeepDays)
		}
		fmt.Println()
	}
}
