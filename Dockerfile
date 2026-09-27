FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Render sets PORT automatically; server.js should already bind to process.env.PORT
EXPOSE 4000

CMD ["npm", "start"]