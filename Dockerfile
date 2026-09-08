# The panel, as one image.
#
# Three stages so that the thing that ends up running carries none of what built
# it: no npm cache, no dev dependencies, no TypeScript, no source. Next traces
# what the app actually imports and writes a standalone server, which is a few
# megabytes rather than the several hundred node_modules weighs.
#
# Debian rather than Alpine on purpose. sharp is a native module and its musl
# builds are the kind of thing that works until an upgrade, and image handling
# is not a place this app can degrade quietly: a screenshot that fails to
# re-encode is a screenshot stored at five times the size.

FROM node:22-slim AS deps
WORKDIR /app
# The lockfile alone, so this layer is reused on every build that did not change
# a dependency, which is almost all of them.
COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked in, not injected at run time.
#
# Anything NEXT_PUBLIC_ is substituted into the client bundle during the build,
# so it has to be here rather than in the environment the container starts with.
# Getting this wrong is quiet: the server knows its own address and every link
# the browser builds points at localhost.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Not root. The one directory this process writes to is the file store, and it
# is a mounted volume owned by this user rather than something inside the image.
RUN groupadd --system --gid 1001 panel \
 && useradd --system --uid 1001 --gid panel panel

COPY --from=builder --chown=panel:panel /app/.next/standalone ./
COPY --from=builder --chown=panel:panel /app/.next/static ./.next/static
COPY --from=builder --chown=panel:panel /app/public ./public

# The schema, and the one script that applies it. Deployed together with the
# code that expects it, so bringing the database up to date is a command run
# against this image rather than a checkout somebody has to remember to update.
COPY --from=builder --chown=panel:panel /app/drizzle ./drizzle
COPY --from=builder --chown=panel:panel /app/scripts/migrate.mjs ./scripts/migrate.mjs

USER panel
EXPOSE 3000

# server.js is what output: "standalone" writes. It listens on PORT and HOSTNAME
# and does not need next start, npm, or anything else in front of it.
CMD ["node", "server.js"]
