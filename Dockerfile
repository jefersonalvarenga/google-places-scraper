FROM apify/actor-node:20

# Copy all files
COPY . ./

# Install all dependencies (including dev for build)
RUN npm install

# Build TypeScript
RUN npm run build

# Remove dev dependencies to save space
RUN npm prune --production

# Start
CMD npm start
