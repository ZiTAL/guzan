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
- Any other private data

## Key Features

### Security Implementation
- **Path-based separation**: Public assets served from `./public/`, private data stored in `./private/`
- **Access controls**: Direct attempts to access `.db` or `.md` files return 404 errors
- **Request filtering**: Blocks common automated tools (curl, wget, scripts) that might indicate scraping attempts
- **Safe file serving**: Uses Node.js path.join to prevent directory traversal vulnerabilities

### Form Functionality
The Guzanda form (`guzanda.html`) provides:
- Standard text inputs for name and contact information
- Textarea for detailed descriptions
- Microphone-based audio recording (alternative to file upload)
- Form validation requiring name and contact fields
- Successful submission feedback with navigation options
- LocalStorage persistence of form data for user convenience: the item `guzandaFormData` stores `name`, `contact` and `description` as the user types, and the values are restored automatically when the form page is loaded again

### Technical Implementation
- **Backend**: Node.js with Express framework
- **Database**: SQLite for persistent storage of submissions, including an 'approved' field for moderation (0/1). Each submission stores an `audio` field containing the absolute realpath of the uploaded audio file in `private/uploads/`. Each submission also gets a unique `review_token` used to build the unguessable review URL
- **Email notifications**: Nodemailer sends the moderator an email with a private review link on every submission. SMTP settings are read from environment variables (see `private/docker/.env.example`)
- **File handling**: Multer middleware for secure audio uploads; uploaded files are written to `private/uploads/` and their realpath is recorded in the database
- **Frontend**: Semantic HTML5 with CSS3 styling and vanilla JavaScript
- **Media recording**: Uses the MediaRecorder API for browser-based audio capture

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
   - The audio file is only reachable through the authenticated review page (via `/review/<token>/audio`)

## Privacy Considerations

- All submission data is stored locally in SQLite database
- Audio files are stored in the private uploads directory
- No data is transmitted to external servers without explicit user action
- Review links are protected by an unguessable per-submission token; the review page and its audio are only accessible with that token
- SMTP credentials are passed via environment variables (`.env` in `private/docker/`, gitignored), never committed to the repository
- Direct web access to database and uploads is prevented by server configuration
- Documentation explains the system without exposing sensitive file contents

## Deployment

The application runs inside a container managed with Docker Compose (using Podman's `docker-compose` support on the server).

### Container Setup

The Docker configuration lives in `private/docker/`:
- `docker-compose.yml` - defines the `guzanda` service
- `Dockerfile` - builds the Node.js image (copies `private/` and `public/`, installs production dependencies from `package.json`)

The container:
- Listens on port 3000 so Caddy's `reverse_proxy localhost:3000` keeps working unchanged
- Bind-mounts `private/guzanda.db` and `private/uploads/` from the host, so submissions and audio files persist on the host even when the container is rebuilt
- Runs on a `node:24-alpine` base image
- Restarts automatically via `restart: unless-stopped` (and on boot when the container service is enabled)

### Running

```bash
cd private/docker
docker-compose up -d --build   # or: podman-compose up -d --build
docker compose ps              # verify the container is running
docker compose logs -f         # follow logs
docker compose down            # stop and remove the container
```

To deploy a new version, rebuild and restart:
```bash
cd private/docker
docker compose up -d --build
```

## Maintenance

The application is designed to be straightforward to maintain:
- Clear separation between public assets and private data
- Well-documented security boundaries
- Standard Node.js/Express patterns
- Minimal dependencies (Express, Multer, SQLite3, Nodemailer)
- Responsive design that works on mobile and desktop devices
- Containerized deployment for easy rollback and consistent environments

### Configuration

SMTP email settings are read from environment variables (see `private/docker/.env.example`):
- `GUZAN_PUBLIC_URL` – public base URL used to build review links
- `GUZAN_SMTP_HOST` / `GUZAN_SMTP_PORT` / `GUZAN_SMTP_SECURE` – SMTP connection settings
- `GUZAN_SMTP_USER` / `GUZAN_SMTP_PASS` – Gmail address and app password
- `GUZAN_MAIL_TO` – the address that receives review notifications
- `GUZAN_MAIL_ENABLED` – set to `false` to disable emails

To configure the deployed container, create `private/docker/.env` (copy `.env.example`) and restart the container. If SMTP is not configured, submissions still work and emailing is skipped with a log message.

## Testing

Automated tests are defined in `private/test.js`. Start the server (either `node server.js` from `private/` or the container via `docker compose up -d`), then run `node test.js`. Tests cover:
- Home page and form page return 200
- Direct access to `.db` and `.md` files returns 404
- Audio upload: posts a multipart form with an audio file to `/guzanda`, verifies the submission succeeds, and (via `private/uploads/`) stores the uploaded file so its realpath can be recorded in the `audio` field of `private/guzanda.db`