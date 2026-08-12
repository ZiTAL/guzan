# guzan

Guzan (GUZAN Herri Plataforma · Bermeo) web orria eta Guzanda formularioa.

## Overview

- **Public website** (`public/`) — homepage with community info, archived content links, and an Instagram feed
- **Guzanda form** (`/guzanda`) — lets community members submit reports/suggestions with an optional in-browser audio recording
- **Moderation** — each submission gets an unguessable review link so moderators can approve or reject it (audio is only reachable through the review page)

## Quick start

### Locally (development)

```bash
cd private
npm install
npm start        # starts server on http://localhost:3000
npm test         # runs tests (requires the server to be running)
```

### Docker (production)

```bash
cd docker
cp .env.example .env   # fill in SMTP / public URL values
./build.sh             # podman compose down && podman compose up -d --build
```

The container exposes the app on host port `8005`. Public assets are bind-mounted (edits picked up immediately); `private/` is baked into the image, so backend changes require a rebuild.

## Documentation

Full technical documentation (architecture, security, deployment, configuration, testing) lives in [DOCUMENTATION.md](DOCUMENTATION.md).
