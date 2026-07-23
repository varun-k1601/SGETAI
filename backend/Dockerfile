FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 5001

CMD ["npm", "start"]
