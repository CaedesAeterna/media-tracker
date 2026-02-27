#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Media Tracker Deployment...${NC}"

# 1. Namespaces
echo "Creating/Verifying Namespaces..."
kubectl create namespace app --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace database --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace kafka --dry-run=client -o yaml | kubectl apply -f -

# 2. RBAC for Strimzi (Critical Fix for Operator in default ns watching kafka ns)
echo "Applying Strimzi RBAC..."
kubectl apply -f k8s/infra/strimzi-rbac.yaml

# 3. Infrastructure
echo "Deploying Infrastructure (Kafka, Mongo, Postgres, Redis)..."
kubectl apply -f k8s/infra/kafka-cluster.yaml
kubectl apply -f k8s/infra/mongodb-replica-set.yaml -n database
kubectl apply -f k8s/infra/postgresql.yaml
kubectl apply -f k8s/infra/redis.yaml

# 4. Build & Load Images (Minikube specific)
echo "Building and Loading Docker Images..."
if command -v minikube &> /dev/null; then
    echo "Detected Minikube environment..."
    eval $(minikube docker-env)
    
    echo "Building User Service..."
    docker build -t user-service:latest services/user-service
    
    echo "Building Media Service..."
    docker build -t media-service:latest services/media-service

    echo "Building Dashboard Service..."
    docker build -t dashboard-service:latest services/dashboard-service
else
    echo "Minikube not found. Skipping local image build/load. Ensure images are in your registry."
fi

# 5. App Deployment
echo "Deploying Application Services..."
kubectl apply -f k8s/apps/user-service.yaml
kubectl apply -f k8s/apps/media-service.yaml
kubectl apply -f k8s/apps/dashboard-service.yaml

# 6. Ingress
echo "Configuring Ingress..."
kubectl apply -f k8s/infra/ingress.yaml

echo -e "${GREEN}Deployment Complete!${NC}"
echo "Access User Service at: http://$(minikube ip)/auth"
echo "Access Media Service at: http://$(minikube ip)/media"
echo "Access Dashboard at: http://$(minikube ip)/dashboard"
