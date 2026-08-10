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
- **Database**: SQLite for persistent storage of submissions, including an 'approved' field for moderation (0/1). Each submission stores an `audio` field containing the absolute realpath of the uploaded audio file in `private/uploads/`
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
   - User receives success confirmation with navigation links

## Privacy Considerations

- All submission data is stored locally in SQLite database
- Audio files are stored in the private uploads directory
- No data is transmitted to external servers without explicit user action
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
- Minimal dependencies (Express, Multer, SQLite3)
- Responsive design that works on mobile and desktop devices
- Containerized deployment for easy rollback and consistent environments

## Testing

Automated tests are defined in `private/test.js`. Start the server (either `node server.js` from `private/` or the container via `docker compose up -d`), then run `node test.js`. Tests cover:
- Home page and form page return 200
- Direct access to `.db` and `.md` files returns 404
- Audio upload: posts a multipart form with an audio file to `/guzanda`, verifies the submission succeeds, and (via `private/uploads/`) stores the uploaded file so its realpath can be recorded in the `audio` field of `private/guzanda.db`