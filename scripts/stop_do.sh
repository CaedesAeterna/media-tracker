#!/bin/bash
set -e

# Resolve the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Move to project root to ensure relative paths work
cd "$PROJECT_ROOT"

echo "========================================================"
echo "STOPPING DEPLOYMENT (Persisting Data)"
echo "========================================================"

# 1. Delete Ingress Resources (App Ingress)
echo "[1/6] Deleting App Ingress..."
if [ -f "k8s/infra/ingress.yaml" ]; then
    kubectl delete -f k8s/infra/ingress.yaml --ignore-not-found
    echo "      App Ingress deleted."
else
    echo "      k8s/infra/ingress.yaml not found (skipping)."
fi

# 2. Delete NGINX Load Balancer (The Costly Part)
echo "[2/6] Deleting NGINX Load Balancer Service..."
if kubectl get svc -n ingress-nginx ingress-nginx-controller > /dev/null 2>&1; then
    kubectl delete svc -n ingress-nginx ingress-nginx-controller
    echo "      NGINX Load Balancer Service deleted."
else
    echo "      NGINX Load Balancer Service not found (skipping)."
fi

# 3. Delete Application Services (Stateless)
echo "[3/6] Deleting Application Services..."
# We use 'ls' to find the files since they might not all be active
if [ -d "k8s/apps" ]; then
    kubectl delete -f k8s/apps/ --ignore-not-found
else
    echo "      k8s/apps directory not found."
fi

# 4. Safeguard and Delete Kafka
# The KafkaNodePool has 'deleteClaim: true'. We MUST patch it to 'false' 
# before deleting, otherwise the PVCs (Data) will be wiped.
echo "[4/6] Handling Kafka (Safeguarding Data)..."
if kubectl get kafkanodepool combined-nodes -n kafka > /dev/null 2>&1; then
    echo "      Patching KafkaNodePool to prevent PVC deletion..."
    kubectl patch kafkanodepool combined-nodes -n kafka --type='merge' -p '{"spec":{"storage":{"deleteClaim":false}}}'
    
    echo "      Deleting Kafka Cluster resources..."
    kubectl delete -f k8s/infra/kafka-cluster.yaml --wait=false
    kubectl delete -f k8s/infra/kafka-topic.yaml --ignore-not-found --wait=false
    
    echo "      Kafka deletion initiated (background)."
else
    echo "      KafkaNodePool 'combined-nodes' not found (skipping)."
fi

# 5. Delete Databases (Postgres, Mongo, Redis)
# StatefulSets for Postgres/Mongo do NOT delete PVCs by default, so data is safe.
echo "[5/6] Deleting Databases..."
kubectl delete -f k8s/infra/postgresql.yaml --ignore-not-found --wait=false
kubectl delete -f k8s/infra/mongodb-replica-set.yaml --ignore-not-found --wait=false
kubectl delete -f k8s/infra/redis.yaml --ignore-not-found --wait=false

# 6. Verify and Scale Down (Optional check)
echo "[6/6] Verifying Shutdown..."
kubectl get pods -n database
kubectl get svc -n ingress-nginx

echo "========================================================"
echo "Deployment Teardown Complete (Async)."
echo ""
echo "IMPORTANT NOTES:"
echo "1. Data Volumes (PVCs) have been PRESERVED."
echo "2. The NGINX Load Balancer Service has been DELETED (Cost saving)."
echo "   - NOTE: To redeploy, you MUST reinstall the NGINX Controller or Service."
echo "3. The Kubernetes Cluster (Nodes/Droplets) is STILL RUNNING."
echo "========================================================"
