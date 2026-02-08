#!/bin/bash

# Helper script to create admin user via API

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <email> <password> [api_url]"
    echo "Example: $0 admin@localhost mypassword http://localhost:3000"
    exit 1
fi

EMAIL=$1
PASSWORD=$2
API_URL=${3:-http://localhost:3000}

echo "Creating admin user: $EMAIL"
echo "API URL: $API_URL"
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 201 ]; then
    echo "✓ Admin user created successfully!"
    echo ""
    echo "Login credentials:"
    echo "  Email: $EMAIL"
    echo "  Password: $PASSWORD"
    echo ""
    echo "You can now login at: $API_URL/admin.html"
else
    echo "✗ Failed to create admin user"
    echo "HTTP Status: $http_code"
    echo "Response: $body"
    exit 1
fi
