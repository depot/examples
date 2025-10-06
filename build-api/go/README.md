# Depot Build API - Go Examples

This directory contains Go examples demonstrating how to use the Depot Build API with direct BuildKit integration.

## Prerequisites

- Go 1.21 or later
- A Depot account with an organization token
- Depot CLI installed (for pulling images)

## Setup

1. Clone the examples repository:

```bash
git clone https://github.com/depot/examples.git
cd examples/build-api/go
```

2. Initialize the Go module and install dependencies:

```bash
go mod init example
go get github.com/depot/depot-go
go mod tidy
```

3. Set your Depot token:

```bash
export DEPOT_TOKEN=<your-org-token>
```

## Examples

### Project Management

#### List Projects

List all projects in your organization:

```bash
go run list-projects/main.go
```

#### Create Project

Create a new project with a 50GB cache and 14-day retention:

```bash
go run create-project/main.go my-project-name
```

Save the Project ID from the output to use in builds.

#### Delete Project

Delete a project by ID:

```bash
go run delete-project/main.go <project-id>
```

### Building Images

Set your project ID for builds:

```bash
export DEPOT_PROJECT_ID=<your-project-id>
```

#### Build Image

Build an image and save it to Depot's infrastructure (no push):

```bash
go run create-build/main.go
```

The built image is stored on Depot's infrastructure and can be pulled using:

```bash
depot pull --project $DEPOT_PROJECT_ID <build-id>
```

**Note:** When using the Go SDK with BuildKit directly, images are stored on Depot's infrastructure by default. This is equivalent to the `--save` behavior in the Depot CLI.

#### Build and Push to Registry

Build and push to an external registry like Docker Hub:

```bash
# Login to your registry first
docker login docker.io

# Run the build (uses docker login credentials by default)
go run build-and-push/main.go docker.io/myuser/myapp:latest

# Or provide credentials programmatically via environment variables
export DOCKERHUB_USERNAME=myuser
export DOCKERHUB_TOKEN=mytoken
go run build-and-push/main.go docker.io/myuser/myapp:latest
```

**Supported registries:**
- Docker Hub: `docker.io/user/image:tag`
- GitHub Container Registry: `ghcr.io/org/image:tag`
- AWS ECR: `123456789012.dkr.ecr.us-east-1.amazonaws.com/image:tag`
- Google Artifact Registry: `us-docker.pkg.dev/project/repo/image:tag`

## Example Structure

```
go/
├── README.md                 # This file
├── go.mod                    # Go module dependencies
├── Dockerfile                # Sample Dockerfile for testing
├── list-projects/            # List all projects
│   └── main.go
├── create-project/           # Create a new project
│   └── main.go
├── delete-project/           # Delete a project
│   └── main.go
├── create-build/             # Build image (saved to Depot)
│   └── main.go
└── build-and-push/           # Build and push to registry
    └── main.go
```

## Authentication

All examples require the `DEPOT_TOKEN` environment variable to be set with your organization token.

For registry pushes, you can either:

1. **Use docker login** (recommended for development):
   ```bash
   docker login docker.io
   ```
   The Go SDK will automatically use these credentials.

2. **Provide credentials programmatically** (recommended for CI/CD):
   ```bash
   export DOCKERHUB_USERNAME=myuser
   export DOCKERHUB_TOKEN=mytoken
   ```
   The `build-and-push` example shows how to use programmatic credentials.

## Documentation

For more information, see the [Build API tutorial](https://depot.dev/docs/container-builds/api/api-tutorial).
