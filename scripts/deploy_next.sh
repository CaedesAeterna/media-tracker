#!/bin/bash
set -e

# 1. Read current version
current_ver=$(cat VERSION)
echo "Current Version: $current_ver"

# 2. Increment version (Logic: Bump Patch. If Patch > 99, Bump Minor and Reset Patch)
IFS='.' read -r -a parts <<< "$current_ver"
major=${parts[0]}
minor=${parts[1]}
patch=${parts[2]}

patch=$((patch + 1))

if [ "$patch" -gt 99 ]; then
    patch=0
    minor=$((minor + 1))
fi

new_ver="${major}.${minor}.${patch}"

echo "Bumping to: $new_ver"

# 3. Setup Minikube Docker Env
eval $(minikube docker-env)

# 4. Dynamic Build & Deploy
# Iterates through all folders in 'services/' directory
services_dir="services"

echo "Detected Services:"
ls $services_dir

for service_path in "$services_dir"/*; do
    if [ -d "$service_path" ]; then
        service_name=$(basename "$service_path")
        
        echo "------------------------------------------------"
        echo "Processing Service: $service_name"
        
        # Build Docker Image
        echo "Building Image: $service_name:$new_ver"
        docker build -t "$service_name:$new_ver" "$service_path"
        
        # Update Kubernetes Deployment
        # Convention: Deployment Name == Container Name == Folder Name
        echo "Updating Cluster Deployment..."
        if kubectl get deployment "$service_name" -n app > /dev/null 2>&1; then
            kubectl set image "deployment/$service_name" "$service_name=$service_name:$new_ver" -n app
        else
            echo "Deployment '$service_name' not found. Creating from manifest..."
            if [ -f "k8s/apps/$service_name.yaml" ]; then
                kubectl apply -f "k8s/apps/$service_name.yaml"
                # The manifest might point to 'latest', so we update it to the new version immediately
                kubectl set image "deployment/$service_name" "$service_name=$service_name:$new_ver" -n app
            else
                echo "Error: Manifest 'k8s/apps/$service_name.yaml' not found. Cannot deploy new service."
            fi
        fi
    fi
done

# 5. Save new version
echo $new_ver > VERSION
echo "------------------------------------------------"
echo "Deployment of v$new_ver initiated."

# 6. Dynamic Wait for Rollout
for service_path in "$services_dir"/*; do
    if [ -d "$service_path" ]; then
        service_name=$(basename "$service_path")
        if kubectl get deployment "$service_name" -n app > /dev/null 2>&1; then
            echo "Waiting for rollout: $service_name"
            kubectl rollout status "deployment/$service_name" -n app
        fi
    fi
done

echo "Done! Application is now running version $new_ver"