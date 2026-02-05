# Use the official Apify Playwright image
FROM apify/actor-node-playwright-chrome:18

# Copy all files
COPY . ./

# Install dependencies
RUN npm install --include=dev

# Run the actor
CMD npm start
