FROM node:18-slim

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required dependencies for ClamAV
RUN apt-get update && apt-get install -y \
    clamav \
    clamav-daemon \
    clamav-freshclam \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Update virus definitions (with error handling)
RUN freshclam || echo "Freshclam exited with status $? - continuing anyway"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all backend files
COPY . .

# Create directories for uploads and downloads
RUN mkdir -p uploads downloads

# Set environment variables
ENV NODE_ENV=development
ENV PORT=4000

# Expose only port 4000 (this container only runs antivirus service)
EXPOSE 4000

# Run only the antivirus server
CMD ["node", "Antivirus_backend/AntivirusAPIs_server.js"]