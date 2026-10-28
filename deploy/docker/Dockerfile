FROM node:24.18.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24.18.0-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=dependencies --chown=node:node /app /app
COPY --chown=node:node src ./src
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts/healthcheck.mjs scripts/validate-deployment-env.mjs ./scripts/
COPY --chown=node:node deploy/docker/api-entrypoint.sh ./deploy/docker/api-entrypoint.sh
RUN mkdir -p /var/lib/kernel-api/uploads && chown -R node:node /var/lib/kernel-api
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "deploy/docker/api-entrypoint.sh"]
CMD ["node", "src/index.ts"]

FROM nginx:1.30.6-trixie AS gateway
COPY deploy/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/docker/15-validate-configuration.sh /docker-entrypoint.d/15-validate-configuration.sh
RUN chmod 755 /docker-entrypoint.d/15-validate-configuration.sh
ENV NGINX_ENVSUBST_FILTER="^(API_HOST|RELEASE_ID|HTTPS_PORT)$"
EXPOSE 80 443
