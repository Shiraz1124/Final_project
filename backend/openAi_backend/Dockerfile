FROM mcr.microsoft.com/playwright:v1.53.0-noble

WORKDIR /app

# Copy package files from backend root
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all backend files
COPY . .

# Set development environment
ENV NODE_ENV=development

# Expose port 3000
EXPOSE 3000

# Run the OpenAI server specifically
CMD ["node", "openAi_backend/openAi_server.js"]