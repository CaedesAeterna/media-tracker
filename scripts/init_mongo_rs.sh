#!/bin/bash

# Function to check if Mongo pods are ready
wait_for_mongo() {
    echo "Waiting for MongoDB pods to be ready..."
    kubectl wait --for=condition=ready pod -l role=mongo -n database --timeout=120s
}

# Function to initialize Replica Set
init_rs() {
    echo "Checking MongoDB Replica Set status..."
    
    # Check if rs0 is already initialized
    # We use || true to prevent script exit if exec fails temporarily
    RS_STATUS=$(kubectl exec mongo-0 -n database -- mongosh --quiet --eval "try { rs.status().ok } catch(e) { 0 }" 2>/dev/null || echo "0")
    
    # Trim whitespace
    RS_STATUS=$(echo "$RS_STATUS" | tr -d '[:space:]')

    if [ "$RS_STATUS" == "1" ]; then
        echo "MongoDB Replica Set is already initialized."
    else
        echo "Initializing MongoDB Replica Set..."
        kubectl exec mongo-0 -n database -- mongosh --quiet --eval '
            try {
                rs.initiate({
                    _id: "rs0",
                    members: [
                        { _id: 0, host: "mongo-0.mongo.database.svc.cluster.local:27017" },
                        { _id: 1, host: "mongo-1.mongo.database.svc.cluster.local:27017" },
                        { _id: 2, host: "mongo-2.mongo.database.svc.cluster.local:27017" }
                    ]
                })
            } catch(e) {
                print("Error initializing RS: " + e);
            }
        '
        echo "MongoDB Replica Set initialization command sent."
    fi
}

# Main execution
wait_for_mongo
init_rs
