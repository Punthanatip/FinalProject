#!/bin/bash

echo "Testing database connection..."
echo "=============================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if the database container is running
DB_CONTAINER=$(docker ps --filter "name=fod_other-main-db" --format "table {{.Names}}" | grep db)
if [ -z "$DB_CONTAINER" ]; then
    echo "❌ Database container is not running."
    echo "Please start the services with: docker-compose up -d db"
    echo "From the project root directory: cd /home/touch/FOD_other-main"
    exit 1
fi

echo "✓ Database container is running."

# Test the database connection using psql
echo "Testing database connection with psql..."
docker exec -i $(docker ps --filter "name=fod_other-main-db" --format "{{.ID}}") psql -U fod -d fod -t -c "SELECT 1;" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Database connection successful!"
    
    # Check if tables exist
    TABLE_COUNT=$(docker exec -i $(docker ps --filter "name=fod_other-main-db" --format "{{.ID}}") psql -U fod -d fod -t -c "SELECT count(tablename) FROM pg_tables WHERE schemaname = 'public' AND (tablename = 'events' OR tablename = 'fod_classes');")
    
    echo "✓ Found $(echo $TABLE_COUNT | tr -d ' ') expected tables"

    # Check fod_classes count
    CLASS_COUNT=$(docker exec -i $(docker ps --filter "name=fod_other-main-db" --format "{{.ID}}") psql -U fod -d fod -t -c "SELECT count(*) FROM fod_classes;")
    echo "✓ fod_classes table has $(echo $CLASS_COUNT | tr -d ' ') records"

    # Check events count
    EVENT_COUNT=$(docker exec -i $(docker ps --filter "name=fod_other-main-db" --format "{{.ID}}") psql -U fod -d fod -t -c "SELECT count(*) FROM events;")
    echo "✓ events table has $(echo $EVENT_COUNT | tr -d ' ') records"

    echo ""
    echo "🎉 Database connection test completed successfully!"
else
    echo "❌ Database connection failed!"
    exit 1
fi