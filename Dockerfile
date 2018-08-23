FROM node:6.14-alpine

ENV PORT=8080
ENV USERID=
ENV PASSWD=

RUN apk add --no-cache --update-cache git \
    && git clone https://github.com/xiaokaixuan/vagex-robot.git \
    && cd vagex-robot && npm install
    
WORKDIR /vagex-robot

EXPOSE $PORT

CMD node app.js

