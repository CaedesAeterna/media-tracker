#!/bin/bash
set -e

# Resolve the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Move to project root to ensure relative paths work
cd "$PROJECT_ROOT"

# Configuration
REGISTRY_PREFIX="registry.digitalocean.com/tiamat"

# 1. Read current version
if [ ! -f VERSION ]; then
    echo "VERSION file not found in $PROJECT_ROOT"
    exit 1
fi
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

# 3. Deploy Infrastructure (DBs, Kafka, Redis, Ingress)
# We apply these FIRST so they are ready (or starting) by the time apps deploy.
echo "------------------------------------------------"
echo "Deploying Infrastructure..."

# Create namespaces if they don't exist
kubectl create namespace app --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace database --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace kafka --dry-run=client -o yaml | kubectl apply -f -

# Restore NGINX Ingress Controller (if missing)
echo "Checking Ingress Controller..."
if ! kubectl get svc -n ingress-nginx ingress-nginx-controller > /dev/null 2>&1; then
    echo "Restoring NGINX Ingress Controller..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
else
    echo "NGINX Ingress Controller already exists."
fi

# Apply Infra Manifests
# Note: applying StatefulSets/PVCs is safe; it connects to existing volumes if available.
kubectl apply -f k8s/infra/strimzi-rbac.yaml
kubectl apply -f k8s/infra/kafka-cluster.yaml
kubectl apply -f k8s/infra/kafka-topic.yaml
kubectl apply -f k8s/infra/mongodb-replica-set.yaml
kubectl apply -f k8s/infra/postgresql.yaml
kubectl apply -f k8s/infra/redis.yaml
kubectl apply -f k8s/infra/ingress.yaml

echo "Infrastructure manifests applied."

# 4. Verify Infrastructure (Mongo RS)
echo "------------------------------------------------"
echo "Verifying Infrastructure..."
# This script contains a 'wait' command for Mongo pods
./scripts/init_mongo_rs.sh

# Optional: Wait for Postgres (Good practice to ensure DB is up before App)
echo "Waiting for Postgres..."
kubectl wait --for=condition=ready pod -l app=postgres -n database --timeout=120s || echo "Postgres wait timed out (continuing...)"

echo "------------------------------------------------"

# 5. Dynamic Build, Tag, Push & Deploy Apps
services_dir="services"

echo "Detected Services:"
ls $services_dir

for service_path in "$services_dir"/*; do
    if [ -d "$service_path" ]; then
        service_name=$(basename "$service_path")
        
        echo "------------------------------------------------"
        echo "Processing Service: $service_name"
        
        # Local tag and Remote tag
        local_image="$service_name:$new_ver"
        remote_image="$REGISTRY_PREFIX/$service_name:$new_ver"
        
        # COPY SHARED PROTOS (Temporary for Build)
        echo "Copying shared protos to $service_path..."
        cp -r shared "$service_path/"

        # Build
        echo "Building Image: $local_image"
        docker build -t "$local_image" "$service_path"
        
        # CLEANUP SHARED PROTOS
        rm -rf "$service_path/shared"

        # Tag for Remote Registry
        echo "Tagging: $remote_image"
        docker tag "$local_image" "$remote_image"
        
        # Push to DigitalOcean Registry
        echo "Pushing to Registry: $remote_image"
        docker push "$remote_image"
        
        # Update Kubernetes Deployment
        echo "Updating Cluster Deployment..."
        if kubectl get deployment "$service_name" -n app > /dev/null 2>&1; then
            # Update existing deployment to use the new image from the registry
            kubectl set image "deployment/$service_name" "$service_name=$remote_image" -n app
        else
            echo "Deployment '$service_name' not found. Creating from manifest..."
            if [ -f "k8s/apps/$service_name.yaml" ]; then
                # Apply the base manifest first
                kubectl apply -f "k8s/apps/$service_name.yaml"
                # Then set the image to the one we just pushed
                kubectl set image "deployment/$service_name" "$service_name=$remote_image" -n app
            else
                echo "Error: Manifest 'k8s/apps/$service_name.yaml' not found. Cannot deploy new service."
            fi
        fi
    fi
done

# 6. Save new version
echo $new_ver > VERSION
echo "------------------------------------------------"
echo "Deployment of v$new_ver initiated."

# 7. Dynamic Wait for Rollout
for service_path in "$services_dir"/*; do
    if [ -d "$service_path" ]; then
        service_name=$(basename "$service_path")
        if kubectl get deployment "$service_name" -n app > /dev/null 2>&1; then
            echo "Waiting for rollout: $service_name"
            kubectl rollout status "deployment/$service_name" -n app
        fi
    fi
done

echo "Done! Application is now running version $new_ver on DigitalOcean."