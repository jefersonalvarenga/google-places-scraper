FROM apify/actor-node-playwright-chrome:20

# Copy package files first
COPY package*.json ./

# Install ALL dependencies including dev (needed for TypeScript)
RUN npm ci

# Copy source code
COPY . ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies to save space
RUN npm prune --production

# Start
CMD npm start