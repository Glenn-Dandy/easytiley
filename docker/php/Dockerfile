FROM php:8.3-fpm-alpine

# pdo_sqlite for layout storage; curl + json are bundled in the official image
RUN apk add --no-cache sqlite-libs \
 && apk add --no-cache --virtual .build-deps sqlite-dev \
 && docker-php-ext-install pdo_sqlite \
 && apk del .build-deps

WORKDIR /var/www
