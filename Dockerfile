FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=5081
EXPOSE 5081
VOLUME ["/app/data", "/app/hls"]
CMD ["npm", "start"]
