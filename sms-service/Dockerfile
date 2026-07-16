FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
EXPOSE 8095
CMD ["node", "dist/index.js"]
