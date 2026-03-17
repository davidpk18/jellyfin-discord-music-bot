# Stage 1: The Builder
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
# Install ALL dependencies (no native C++ compiling needed anymore)
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# Stage 2: The Lean Runner
FROM node:24-alpine AS runner
# We only need ffmpeg for pushing the stream
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
WORKDIR /app
COPY package.json yarn.lock ./
# Install production dependencies
RUN yarn install --production --frozen-lockfile && yarn cache clean
# Pull the compiled code from Stage 1
COPY --from=builder /app/dist ./dist

USER node
CMD ["node", "dist/main"]
