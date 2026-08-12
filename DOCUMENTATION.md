# Guzan Project Documentation

## Project Overview

This is a web platform for the Guzan community organization in Bermeo. The project consists of:

- A public-facing website with information about the organization
- A submission form (Guzanda) allowing community members to submit reports or suggestions with optional audio recordings
- Secure handling of sensitive data including database and file uploads

## Directory Structure

The project implements a security-first approach by separating public and private components:

### Public Directory
Contains assets that are safe to serve directly via the web server:
- HTML pages for the main website
- CSS stylesheets
- Client-side JavaScript
- Public images and media

### Private Directory
Contains sensitive data that should not be directly accessible via the web:
- SQLite database storing form submissions
- Uploaded audio files from the Guzanda form
- Application code: `server.js` (entry point: middleware + mounts the routes), `config.js` (env configuration), `routes.js` (all HTTP routes), and helper modules in `lib/`
- Any other private data

## Key Features

### Security Implementation
- **Path-based separation**: Public assets served from `./public/`, private data stored in `./private/`
- **Access controls**: Direct attempts to access `.db` or `.md` files return 404 errors
- **Request logging**: Per-request logging (method, path, user-agent) is disabled by default and can be enabled with `GUZAN_LOG_REQUESTS=true`
- **Safe file serving**: Uses Node.js path.join to prevent directory traversal vulnerabilities

### Form Functionality
The Guzanda form (`guzanda.html`) provides:
- Standard text inputs for name and contact information
- Textarea for detailed descriptions
- Microphone-based audio recording (alternative to file upload) with a live `HH:MM:SS` timer and a 5-minute maximum; recording stops automatically at the limit
- Form validation requiring name and contact fields
- Successful submission feedback with navigation options
- LocalStorage persistence of form data for user convenience: the item `guzandaFormData` stores `name`, `contact` and `description` as the user types, and the values are restored automatically when the form page is loaded again

### Technical Implementation
- **Backend**: Node.js with Express framework, split into small modules:
  - `private/server.js` – entry point: sets up Express, middleware (body parsing, static files, optional request logging, `.db`/`.md` blocking), and mounts the route router
  - `private/config.js` – reads all configuration from environment variables (see `docker/.env.example`)
  - `private/routes.js` – all HTTP routes (home, Guzanda form, review, `/api/instagram`) as `async/await` handlers, and the Multer file upload setup
  - `private/lib/db.js` – SQLite connection, table schema/migration, and query helpers (plus promise-based variants used by the async route handlers)
  - `private/lib/security.js` – HTML escaping and CSRF token handling
  - `private/lib/email.js` – SMTP notification via Nodemailer
  - `private/lib/instagram.js` – Playwright scraper with result caching
  - `private/lib/templates.js` – server-side rendering of shared partials (`{{footer}}`), a generic `fillTemplate()` placeholder substitution helper, and the review page badge/approve-form markup
- **Database**: SQLite for persistent storage of submissions, including an 'approved' field for moderation with three states: `-1` Erabakitzeke / pending (default), `0` Ezeztatuta / rejected, `1` Onartua / approved. Each submission stores an `audio` field containing the absolute realpath of the uploaded audio file in `private/uploads/`. Each submission also gets a unique `review_token` used to build the unguessable review URL
- **Email notifications**: Nodemailer sends the moderator an email with a private review link on every submission. SMTP settings are read from environment variables (see `docker/.env.example`)
- **File handling**: Multer middleware for secure audio uploads; uploaded files are written to `private/uploads/` under a randomly generated name (never the user-supplied filename) and their realpath is recorded in the database
- **Frontend**: Semantic HTML5 with CSS3 styling and vanilla JavaScript
- **Media recording**: Uses the MediaRecorder API for browser-based audio capture
- **Shared markup**: Repeated page regions (currently the footer) live in a single partial, `private/partials/footer.html`, and are injected server-side. Public HTML pages use a `{{footer}}` placeholder, and the `renderPage()` helper in `private/lib/templates.js` replaces it before sending. This way the footer is edited in exactly one file. The generic `fillTemplate(template, values)` helper performs the same `{{placeholder}}` substitution for arbitrary values and is used by the success and review pages. `express.static` is configured with `index: false` so the home page is served through the `/` route (which renders the partial) instead of being sent raw from disk
- **Dynamic Instagram posts**: The homepage's "last 3 posts" are served by a server-side proxy at `/api/instagram`. `private/lib/instagram.js` scrapes the profile page of `GUZAN_INSTAGRAM_USER` (default `guzanbermeo`) using a headless Chromium launched via Playwright, caches the result for `GUZAN_INSTAGRAM_CACHE_TTL` seconds (default 1 hour), and returns JSON. The grid is scanned for both photo (`/p/`) and reel (`/reel/`) links so the most recent posts are always picked up regardless of type. Each of the top 3 posts is then opened individually and its real caption is read from the post page's `meta[name=description]`/`og:description` metadata — the profile grid's `img.alt` is only Instagram's auto-generated image description, so it is never used. Cards show image + caption title + link (no separate description paragraph). If the scrape fails (e.g. Instagram serves a login wall), the endpoint returns an empty list and the frontend falls back to the static cards baked into `app.js`. Because Instagram heavily blocks anonymous scraping, the feed may be unreliable; the scrape runs in the container's bundled Chromium (installed at image build time)

## Data Flow

1. User accesses the form at `/guzanda`
2. User fills out form and optionally records audio via microphone
3. On submission:
   - Form data is sent to `/guzanda` endpoint via POST
   - Server validates required fields (name, contact)
   - If audio was recorded, it's processed and saved to `private/uploads/`
   - Submission data is stored in `private/guzanda.db`: the `audio_file` column holds the uploaded filename, and the `audio` column stores the absolute realpath of the file in `private/uploads/`
   - A random `review_token` is generated and stored with the submission
   - An email with a review link (`https://guzan.eus/review/<token>`) is sent to the configured moderator address
   - User receives success confirmation with navigation links
4. The moderator opens the review link:
   - The review page shows name, contact, description, and an audio player
   - Clicking "Onartu" sets `approved = 1` in the database
   - Clicking "Ezeztatu" (red button) sets `approved = 0` in the database
   - The audio file is only reachable through the authenticated review page (via `/review/<token>/audio`)

## Privacy Considerations

- All submission data is stored locally in SQLite database
- Audio files are stored in the private uploads directory
- No data is transmitted to external servers without explicit user action
- Review links are protected by an unguessable per-submission token; the review page and its audio are only accessible with that token
- SMTP credentials are passed via environment variables (`.env` in `docker/`, gitignored), never committed to the repository
- Direct web access to database and uploads is prevented by server configuration
- Documentation explains the system without exposing sensitive file contents

## Deployment

The application runs inside a container managed with Docker Compose (using Podman's `docker-compose` support on the server).

### Container Setup

The Docker configuration lives in `docker/`:
- `docker-compose.yml` - defines the `guzanda` service
- `Dockerfile` - builds the Node.js image (copies `private/` and `public/`, installs production dependencies from `package.json`, and installs Playwright's Chromium browser with its system dependencies for the Instagram feed)
- `build.sh` - convenience script that runs `podman compose down && podman compose up -d --build`

The container:
- Exposes the app on port 3000, published on the host as port 8005 (`8005:3000`)
- Bind-mounts `private/guzanda.db`, `private/uploads/`, and `public/` from the host, so submissions, audio files, and frontend assets persist on the host even when the container is rebuilt
- Runs on a `node:24-trixie-slim` base image (chosen so Playwright can install Chromium with its system dependencies)
- Restarts automatically via `restart: unless-stopped` (and on boot when the container service is enabled)

> **Note on live vs. baked-in changes:** `public/` is bind-mounted, so edits to HTML, CSS, and client-side JS are picked up immediately (no rebuild needed). `private/` is baked into the image at build time, so changes to `server.js`, `config.js`, `routes.js`, the `lib/` folder, the `partials/` folder, `review.html`, or `package.json` require rebuilding the image and recreating the container.

### Running

```bash
cd docker
podman compose up -d --build    # build image and start the container
podman compose ps               # verify the container is running
podman compose logs -f          # follow logs
podman compose down             # stop and remove the container
```

To deploy a new version, rebuild and restart:
```bash
cd docker
podman compose up -d --build
```

If the container name is already in use after a rebuild (e.g. an old container is still running), recreate it:
```bash
cd docker
podman compose down && podman compose up -d
```

## Maintenance

The application is designed to be straightforward to maintain:
- Clear separation between public assets and private data
- Well-documented security boundaries
- Standard Node.js/Express patterns
- Minimal dependencies (Express, Multer, SQLite3, Nodemailer, Playwright)
- Responsive design that works on mobile and desktop devices
- Containerized deployment for easy rollback and consistent environments

### Configuration

SMTP email settings are read from environment variables (see `docker/.env.example`):
- `GUZAN_PUBLIC_URL` – public base URL used to build review links
- `GUZAN_SMTP_HOST` / `GUZAN_SMTP_PORT` / `GUZAN_SMTP_SECURE` – SMTP connection settings
- `GUZAN_SMTP_USER` / `GUZAN_SMTP_PASS` – Gmail address and app password
- `GUZAN_MAIL_TO` – the address that receives review notifications
- `GUZAN_MAIL_ENABLED` – set to `false` to disable emails
- `GUZAN_INSTAGRAM_USER` – Instagram username whose latest posts are scraped for the homepage (default `guzanbermeo`)
- `GUZAN_INSTAGRAM_CACHE_TTL` – how many seconds to cache scraped posts before re-checking (default `3600`)
- `GUZAN_LOG_REQUESTS` – set to `true` to log every request (method, path, user-agent); off by default

To configure the deployed container, create `docker/.env` (copy `.env.example`) and restart the container. If SMTP is not configured, submissions still work and emailing is skipped with a log message.

## Testing

Automated tests are defined in `private/test.js`. Start the server (`npm start` from `private/`, i.e. `node server.js`, or the container via `podman compose up -d`), then run `npm test` (i.e. `node test.js`). Tests cover:
- Home page and form page return 200
- Direct access to `.db` and `.md` files returns 404
- Audio upload: posts a multipart form with an audio file to `/guzanda`, verifies the submission succeeds, and (via `private/uploads/`) stores the uploaded file so its realpath can be recorded in the `audio` field of `private/guzanda.db`