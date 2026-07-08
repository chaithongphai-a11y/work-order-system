FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY data ./data

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

EXPOSE 8787
CMD ["node", "server.js"]
