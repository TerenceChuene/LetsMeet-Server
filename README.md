# LetsMeet Server

Production-oriented backend for a scalable video conferencing platform (Google Meet–style).

**Stack:** Node.js · Express (ESM) · PostgreSQL · Prisma · Redis · LiveKit · Socket.IO

## Prerequisites

- Node.js 20+ (nvm recommended)
- Docker & Docker Compose (your user must be in the `docker` group)

```bash
# One-time Docker access (then log out/in)
sudo usermod -aG docker "$USER"
```

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Environment
cp .env.example .env

# 3. Start infrastructure (Postgres + Redis + Azurite + LiveKit)
docker compose up -d

# 4. Generate Prisma client & apply migrations
npm run db:generate
npx prisma migrate deploy
# or during local schema iteration:
# npm run db:migrate

# 5. Start API
npm run dev
```

Health check: [http://localhost:3000/health](http://localhost:3000/health)

Readiness: [http://localhost:3000/health/ready](http://localhost:3000/health/ready)

API base: `/api/v1`

### Frontend (Angular)

```bash
cd letsmeet
npm install
npm start
```

App: [http://localhost:4200](http://localhost:4200) (proxies API + Socket.IO to this server)

### Auth & users (Phase 2)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/register` | No |
| POST | `/api/v1/auth/login` | No |
| POST | `/api/v1/auth/logout` | Refresh cookie/body |
| POST | `/api/v1/auth/refresh` | Refresh cookie/body |
| POST | `/api/v1/auth/forgot-password` | No |
| POST | `/api/v1/auth/reset-password` | No |
| POST | `/api/v1/auth/verify-email` | No |
| GET | `/api/v1/users/me` | Bearer |
| PATCH | `/api/v1/users/me` | Bearer |
| GET | `/api/v1/users/:id` | Optional |
| GET | `/api/v1/users/search?q=` | Bearer |

### Meetings & participants (Phase 3)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/meetings` | Bearer |
| GET | `/api/v1/meetings` | Bearer |
| POST | `/api/v1/meetings/join` | Bearer (by code) |
| GET | `/api/v1/meetings/:id` | Bearer |
| PATCH | `/api/v1/meetings/:id` | Bearer (host) |
| POST | `/api/v1/meetings/:id/start` | Bearer (host) |
| POST | `/api/v1/meetings/:id/end` | Bearer (host) |
| POST | `/api/v1/meetings/:id/join` | Bearer |
| POST | `/api/v1/meetings/:id/leave` | Bearer |
| GET | `/api/v1/meetings/:id/participants` | Bearer |
| PATCH | `/api/v1/meetings/:id/participants/:userId` | Bearer |
| POST | `/api/v1/meetings/:id/participants/:userId/remove` | Bearer (host) |
| GET | `/api/v1/meetings/:id/waiting-room` | Bearer (host) |
| POST | `/api/v1/meetings/:id/waiting-room/:userId/approve` | Bearer (host) |
| POST | `/api/v1/meetings/:id/waiting-room/:userId/reject` | Bearer (host) |

### LiveKit (Phase 4)

Media (audio/video) is transported by LiveKit only — never through Express or Socket.IO.

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/livekit/token` | Bearer (JOINED participant) |
| POST | `/api/v1/webhooks/livekit` | LiveKit signature |

Join/start/approve responses may include a `media` object: `{ token, url, roomName, identity }`.

### Socket.IO signalling (Phase 5)

Connect to `ws://localhost:3000` path `/socket.io` with:

```js
io('http://localhost:3000', { auth: { token: accessToken } })
```

Application events (not media): `meeting:join|leave|started|ended`, `participant:*`, `chat:message|typing`, `hand:raised`, `screen:sharing`, `waiting-room:*`.

REST chat history: `GET/POST /api/v1/meetings/:id/messages` · delete/moderate: `DELETE /api/v1/meetings/:id/messages/:messageId`

### Recordings & notifications (Phase 6)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/v1/meetings/:id/recordings/start` | Host only · LiveKit egress → Azure Blob |
| POST | `/api/v1/meetings/:id/recordings/stop` | Host only |
| GET | `/api/v1/recordings` | List accessible recordings |
| GET | `/api/v1/recordings/:id/download` | Temporary signed URL |
| POST | `/api/v1/meetings/:id/invitations` | Invite + email/in-app notify |
| GET | `/api/v1/notifications` | In-app inbox |
| POST | `/api/v1/notifications/:id/read` | Mark read |

Reminders job: `src/jobs/meetingReminders.js` (`sendUpcomingMeetingReminders()`).

### Admin & docs (Phase 7)

API docs (Swagger UI): [http://localhost:3000/api/docs](http://localhost:3000/api/docs) · raw: `/api/docs.json`

| Method | Path | Role |
|--------|------|------|
| GET | `/api/v1/admin/dashboard` | ADMIN+ |
| GET | `/api/v1/admin/users` | ADMIN+ |
| POST | `/api/v1/admin/users/:id/suspend` | ADMIN+ |
| POST | `/api/v1/admin/users/:id/activate` | ADMIN+ |
| PATCH | `/api/v1/admin/users/:id/role` | SUPER_ADMIN |
| GET | `/api/v1/admin/meetings` | ADMIN+ |
| POST | `/api/v1/admin/meetings/:id/end` | ADMIN+ |
| GET | `/api/v1/admin/audit-logs` | ADMIN+ |
| GET | `/api/v1/admin/system/health` | ADMIN+ |

Create/promote an admin:

```bash
npm run admin:create -- --email admin@example.com --password 'SecurePass1' --name Admin
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start API with file watch |
| `npm start` | Start API |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Run Vitest unit + integration tests |

## Project layout

```
src/
  config/           # Environment & app config
  database/         # Prisma client
  middleware/       # Express middleware
  modules/          # Domain modules (auth, meetings, …)
  infrastructure/   # Redis, logging, storage, email
  sockets/          # Socket.IO (Phase 5)
  app.js            # Express app factory
  server.js         # Process entry
prisma/
  schema.prisma
  migrations/
docker/
docker-compose.yml
```

## Implementation phases

1. **Foundation** — Express, Postgres, Redis, Docker, health checks
2. **Auth + users** — JWT, Argon2, RBAC, profiles
3. **Meetings + participants** — lifecycle, waiting room, roles
4. **LiveKit media** — SFU rooms, tokens, webhooks
5. **Socket.IO signalling** — app events, Redis adapter
6. **Chat / recordings / notifications**
7. **Admin + OpenAPI + coverage** *(current)*
8. Production hardening

## Environment variables

See [`.env.example`](.env.example) for the full list. Never commit `.env`.

## License

ISC
