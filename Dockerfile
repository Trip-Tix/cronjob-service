FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 5050
RUN chown -R node /usr/app
USER node
CMD ["npm", "start"]
