# Yutopia's API (Laravel) on FrankenPHP in classic mode (no worker state to leak
# between requests). One image, three jobs: the API, the queue worker, the scheduler.
#   dev:  docker/compose.yaml bind-mounts the source (target "dev")
#   prod: docker/prod/compose.yaml builds the code in (target "prod")
FROM dunglas/frankenphp:1.13.0-php8.4-alpine AS base
RUN install-php-extensions pdo_pgsql pcntl intl zip opcache
COPY --from=composer:2.10 /usr/bin/composer /usr/bin/composer
WORKDIR /app
EXPOSE 8000

# (APP_ENV, debug and the demo people come from apps/api/.env: local on a laptop,
# production on a server that runs this dev stack)
FROM base AS dev
CMD ["sh", "-c", "composer install --no-interaction --quiet && { [ -f .env ] || { cp .env.example .env && php artisan key:generate; }; } && php artisan migrate --force && php artisan db:seed --force && exec frankenphp php-server --root public/ --listen :8000"]

FROM base AS prod
ENV APP_ENV=production APP_DEBUG=false
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-scripts --no-autoloader --prefer-dist
COPY . .
RUN composer dump-autoload --optimize --no-dev \
    && rm -f .env database/database.sqlite \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs storage/app/private \
    && chown -R www-data:www-data storage bootstrap/cache
USER www-data
# config/route caches are built at start, once the real env is in place
CMD ["sh", "-c", "php artisan config:cache && php artisan route:cache && php artisan migrate --force && exec frankenphp php-server --root public/ --listen :8000"]
