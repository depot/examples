# Depot Build API - Go Examples

This directory contains Go examples demonstrating how to use the Depot Build API with direct BuildKit integration.

## Prerequisites

- Go 1.21 or later
- Depot CLI installed
- A Depot account with an organization token

## Setup

1. Initialize the Go module:

```bash
go mod init example
go get github.com/depot/depot-go
go mod tidy
```

2. Set your Depot token:

```bash
export DEPOT_TOKEN=<your-org-token>
export DEPOT_PROJECT_ID=<your-project-id>
```

## Examples

### Simple Build

Build an image without pushing:

```bash
go run simple-build/main.go
```

### Build and Push to Registry

Build and push to an external registry like Docker Hub:

```bash
# Login to your registry first
docker login docker.io

# Set credentials (optional - uses docker login by default)
export DOCKERHUB_USERNAME=myuser
export DOCKERHUB_TOKEN=mytoken

# Run the build
go run build-and-push/main.go docker.io/myuser/myapp:latest
```

## Documentation

For more information, see the [Build API tutorial](https://depot.dev/docs/container-builds/api/api-tutorial).
