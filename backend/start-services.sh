#!/bin/bash
set -e

# Start ClamAV daemon
service clamav-daemon start || echo "ClamAV daemon failed to start, continuing anyway"

# Start OpenAI server in the background
node openAi_server.js &
OPENAI_PID=$!

# Start AntivirusAPIs server in the foreground
node AntivirusAPIs_server.js &
ANTIVIRUS_PID=$!

# Handle graceful shutdown
trap 'kill $OPENAI_PID $ANTIVIRUS_PID; exit' SIGINT SIGTERM

# Keep the container running
wait