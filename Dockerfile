FROM node:lts
WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

COPY .env.server ./.env

EXPOSE 3000

CMD ["node", "server.js"]