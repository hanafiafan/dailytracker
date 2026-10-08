FROM node:22-alpine
ENV NODE_ENV=production NODE_NO_WARNINGS=1
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/scripts ./scripts
COPY public /app/public
USER node
CMD ["node", "src/index.js"]
