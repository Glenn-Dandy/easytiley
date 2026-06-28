# Single self-contained image: nginx + php-fpm 8.3 (run together via supervisord).
FROM php:8.3-fpm-alpine

# nginx + supervisor + pdo_sqlite
RUN apk add --no-cache nginx supervisor sqlite-libs \
 && apk add --no-cache --virtual .build-deps sqlite-dev \
 && docker-php-ext-install pdo_sqlite \
 && apk del .build-deps

WORKDIR /var/www

# App code (copied in -> portable image, no bind mounts needed to deploy)
COPY public/ ./public/
COPY src/    ./src/

# nginx + php-fpm + supervisor config
COPY docker/nginx.conf        /etc/nginx/http.d/default.conf
COPY docker/php/www-pool.conf /usr/local/etc/php-fpm.d/zzz-pool.conf
COPY docker/supervisord.conf  /etc/supervisord.conf

# data dir (sqlite) writable by the php-fpm worker user
RUN mkdir -p /var/www/data /run/nginx \
 && chown -R www-data:www-data /var/www/data

ENV FHEM_URL=http://192.168.10.2:8083/fhem \
    DB_PATH=/var/www/data/fhem.db

EXPOSE 80
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
