# Web Game Center — Backend

Backend API for the Web Game Center project.

**Current scope:** authentication and user system only.
Games, scores, leaderboards, payments and other modules are **not** implemented yet — the
project is structured so they can be added later without rework.

## Tech stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Runtime            | Node.js (>= 18)                 |
| Web framework      | Express.js                     |
| Database           | MongoDB + Mongoose              |
| Auth               | JWT (Bearer access tokens)      |
| Password hashing   | bcrypt                          |
| API docs           | Swagger / OpenAPI 3 (Swagger UI)|
| Config             | dotenv                          |
| Security extras    | helmet, cors, input validation  |

## Project structure

```
src/
├── app.js                 # Express app: middleware, routes, docs, error handling
├── server.js              # Entry point: DB connection + HTTP server + graceful shutdown
├── config/
│   ├── env.js             # Loads & validates environment variables
│   ├── database.js        # Mongoose connection setup
│   └── roles.js           # Central role definitions (player / moderator / admin)
├── models/
│   └── user.model.js      # User schema, password hashing hook, helpers
├── controllers/
│   ├── auth.controller.js # Request/response layer for auth endpoints
│   └── user.controller.js # Request/response layer for user endpoints
├── services/
│   ├── auth.service.js    # Business logic (register / login / change password)
│   └── user.service.js    # Business logic (paginated user listing)
├── routes/
│   ├── index.js           # /api router + health check
│   ├── auth.routes.js     # /api/auth routes (+ Swagger annotations)
│   └── user.routes.js     # /api/users routes (+ Swagger annotations)
├── middleware/
│   ├── auth.middleware.js   # requireAuth / optionalAuth / requireRole
│   ├── validate.middleware.js # express-validator result handler
│   └── error.middleware.js    # 404 + centralized error handler
├── validators/
│   ├── auth.validator.js  # express-validator rule sets for auth
│   └── user.validator.js  # express-validator rule sets for user queries
├── scripts/
│   └── seedAdmin.js       # one-off: create/promote the platform admin account
├── docs/
│   └── swagger.js         # OpenAPI definition + shared schemas
└── utils/
    ├── ApiError.js        # Error class with HTTP status codes
    ├── apiResponse.js     # sendSuccess() helper for consistent responses
    ├── asyncHandler.js    # async route wrapper
    ├── jwt.js             # sign / verify access tokens
    └── logger.js          # thin logging wrapper
```

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

| Variable             | Required | Description                                                        |
| -------------------- | -------- | ------------------------------------------------------------------ |
| `PORT`               | no       | HTTP port (default `5000`)                                        |
| `NODE_ENV`           | no       | `development` \| `production` \| `test`                           |
| `MONGO_URI`          | **yes**  | MongoDB connection string (see below)                            |
| `JWT_SECRET`         | **yes**  | Secret used to sign JWTs — use a long random string               |
| `JWT_EXPIRES_IN`     | no       | Token lifetime (default `7d`)                                     |
| `BCRYPT_SALT_ROUNDS` | no       | bcrypt cost factor (default `12`)                                 |
| `CORS_ORIGIN`        | no       | Allowed origin(s), comma-separated, or `*` (default `*`)          |
| `ADMIN_USERNAME`     | no       | Admin seed username (default `Admin`) — see "Admin account"       |
| `ADMIN_EMAIL`        | no       | Admin seed email (default `admin@gmail.com`)                      |
| `ADMIN_PASSWORD`     | seed     | Required only when running `npm run seed:admin`                   |
| `ADMIN_RESET_PASSWORD` | no     | `true` to overwrite an existing admin's password on seed          |

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The app **fails fast on startup** if `MONGO_URI` or `JWT_SECRET` is missing.
Never commit your real `.env` — it is already in `.gitignore`.

## 3. Configure MongoDB (Atlas)

Put your connection string in the **`MONGO_URI`** variable inside `.env`.

**MongoDB Atlas (recommended):**

1. Create a free cluster at <https://www.mongodb.com/cloud/atlas>.
2. Under *Database Access*, create a database user (username + password).
3. Under *Network Access*, add your IP (or `0.0.0.0/0` for development).
4. Click *Connect → Drivers* and copy the connection string.
5. Paste it into `.env` as `MONGO_URI`, replacing `<db_username>` / `<db_password>`
   with your database user's credentials and adding the database name
   (`game_center`) after the host:

```
MONGO_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/game_center?retryWrites=true&w=majority
```

**Local MongoDB (alternative):**

```
MONGO_URI=mongodb://127.0.0.1:27017/game_center
```

Notes:

- The database name comes from the URI. If you omit it, the app connects to a
  database called **`game_center`** automatically (`src/config/database.js`).
- Nothing is hardcoded — the connection string is read only from `process.env.MONGO_URI`.
- Credentials are never logged; connection errors are printed with the user/password redacted.

## 4. Run the project

Development (auto-reload via nodemon):

```bash
npm run dev
```

Production-style:

```bash
npm start
```

On success you'll see:

```
[info] MongoDB connected successfully (db: game_center)
[info] Server listening on http://localhost:5000 (development)
[info] Swagger UI:  http://localhost:5000/api-docs
```

The server connects to MongoDB **before** it starts listening. If the database
connection fails, it logs a redacted error and exits (exit code 1) rather than
serving requests without a database.

### Verify users in MongoDB Atlas

After registering through Swagger, open the Atlas UI →
*Browse Collections* → database `game_center` → collection **`users`**.
You should see your new document with a bcrypt `password` hash (starts with `$2b$`),
`role: "player"`, and `createdAt` / `updatedAt` timestamps.

## 5. Swagger / API documentation

Interactive docs: <http://localhost:5000/api-docs>
Raw OpenAPI JSON: <http://localhost:5000/api-docs.json>

To test protected endpoints:

1. Call `POST /api/auth/login` and copy `data.accessToken` from the response.
2. Click **Authorize** (top-right in Swagger UI).
3. Paste the token (just the token — Swagger adds the `Bearer ` prefix) and confirm.
4. Now `GET /api/auth/me` and `PATCH /api/auth/change-password` will work.

## Authentication endpoints

All responses share a consistent envelope:

```jsonc
// success
{ "success": true, "message": "…", "data": { … } }
// error
{ "success": false, "message": "…", "errors": [ { "field": "…", "message": "…" } ] }
```

| Method & path                   | Auth        | Description                                        |
| ------------------------------- | ----------- | ------------------------------------------------- |
| `POST /api/auth/register`       | public      | Register a new account (role forced to `player`) |
| `POST /api/auth/login`          | public      | Log in with email + password, returns a JWT      |
| `GET  /api/auth/me`             | **Bearer**  | Get the current user's public profile            |
| `PATCH /api/auth/change-password` | **Bearer**| Change password (needs `currentPassword`)         |
| `GET  /api/users`               | **Bearer (admin)** | List users, paginated (`?page`, `?limit`, `?role`) |
| `GET  /api/health`              | public      | Health check                                     |

### `GET /api/users` — paginated user list

Admin only. Query parameters (all optional):

| Param   | Type    | Default | Notes                                      |
| ------- | ------- | ------- | ------------------------------------------ |
| `page`  | integer | `1`     | 1-based page number                        |
| `limit` | integer | `10`    | 1–100                                      |
| `role`  | string  | —       | filter: `player` \| `moderator` \| `admin` |

```bash
curl "http://localhost:5000/api/users?page=1&limit=10&role=player" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

```jsonc
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [ { "id": "…", "username": "…", "email": "…", "role": "player", "createdAt": "…", "updatedAt": "…" } ],
    "pagination": {
      "page": 1, "limit": 10, "total": 42, "totalPages": 5,
      "hasNextPage": true, "hasPrevPage": false
    }
  }
}
```

There is no self-service way to become an admin (registration always creates a
`player`). To allow moderators to use this endpoint too, change
`requireRole(ROLES.ADMIN)` to `requireRole(ROLES.ADMIN, ROLES.MODERATOR)` in
`src/routes/user.routes.js`.

## Admin account (seed)

`admin` is the highest role — it passes every `requireRole` / `requireRole(ROLES.ADMIN)`
check in the app. Create or update the platform admin with a one-off script.

1. Set these in `.env`:

   ```
   ADMIN_USERNAME=Admin
   ADMIN_EMAIL=admin@gmail.com
   ADMIN_PASSWORD=your-admin-password
   ADMIN_RESET_PASSWORD=false
   ```

2. Run:

   ```bash
   npm run seed:admin
   ```

The script is idempotent:

- no user with `ADMIN_EMAIL` → creates one with role `admin` (password hashed with bcrypt).
- user already exists → promotes it to `admin` and fixes the username if needed.
- to overwrite an existing admin's password, set `ADMIN_RESET_PASSWORD=true`, run the
  script once, then set it back to `false`.

Then log in normally:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com","password":"your-admin-password"}'
```

### Examples

**Register**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"player_one","email":"player@example.com","password":"SuperSecret123"}'
```

**Login**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"player@example.com","password":"SuperSecret123"}'
```

**Get current user**

```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Change password**

```bash
curl -X PATCH http://localhost:5000/api/auth/change-password \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"SuperSecret123","newPassword":"EvenBetter456"}'
```

## Guest vs authenticated access

Authentication is **not** global. The middleware layer provides:

- `requireAuth` — hard requirement; use on account/protected routes.
- `optionalAuth` — attaches `req.user` if a valid token is present, otherwise continues as a guest.
- `requireRole(...roles)` — role guard, runs after `requireAuth`.

When game endpoints are added later, mount public ones with no auth (or `optionalAuth`)
and protected ones behind `requireAuth`.

## Roles

Defined in `src/config/roles.js`: `player`, `moderator`, `admin`.
Every registration gets `player`; the client cannot choose a role. Add roles there as needed.

## Security notes

- Passwords are hashed with bcrypt before saving (Mongoose pre-save hook); the `password`
  field has `select: false` so it is never returned by default queries or serialization.
- JWT secret comes only from `JWT_SECRET`.
- `helmet` sets sensible security headers; request bodies are size-limited and validated.
- Duplicate usernames/emails are blocked at both the application layer and via unique indexes.
- Stack traces are only included in error responses outside `production`.
