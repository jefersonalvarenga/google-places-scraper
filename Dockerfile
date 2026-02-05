FROM apify/actor-node:20

# Copy all files
COPY . ./

# Install ALL dependencies including dev
RUN npm install

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Start
CMD npm start