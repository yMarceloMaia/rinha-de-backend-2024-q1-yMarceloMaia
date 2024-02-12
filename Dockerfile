FROM node:latest

WORKDIR /app

COPY package*.json ./

RUN apt-get update && apt-get install -y postgresql-client

RUN npm install

COPY . .

EXPOSE 4000

CMD ["node", "src/index.js"]