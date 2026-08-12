FROM node:24-trixie-slim

WORKDIR /app

COPY private/package.json private/package-lock.json ./private/
RUN cd private && npm install --omit=dev && npx playwright install --with-deps chromium

COPY private ./private
COPY public ./public

WORKDIR /app/private

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]
