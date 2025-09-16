FROM node:18
WORKDIR /app

COPY . .

RUN npm install --production

COPY .env.server ./.env

EXPOSE 3000

CMD ["node", "src/app.js"]