FROM node:24-alpine3.24 AS build

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:24-alpine3.24 AS production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
