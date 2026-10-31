# Deploying to IIS

The voting system runs on IIS the same way as the self-service app (`/zbss` and `/zbss/api`):
the frontend and the API are two IIS applications on the same site, so the browser calls the
API on its own origin.

| URL | IIS application | Folder contents |
| --- | --- | --- |
| `https://aps2.zemenbank.com/zbvs/` | `zbvs` | frontend build (`voting/build`) |
| `https://aps2.zemenbank.com/zbvs/api/` | `zbvs/api`, nested in `zbvs` | this repository (iisnode) |

`/zbvs` is only a name. To use another path, change it in three places: the IIS applications,
`API_PREFIX` in the backend `.env`, and `VITE_API_BASE` when building the frontend.

## How sign-in works

| | Local development | Server |
| --- | --- | --- |
| `AUTH_MODE` | `local` | `ldap` (the default when unset) |
| Who can sign in | any account, password `1234` / `test123` / `admin123` | staff, with their Zemen Bank domain account |
| API without a token | allowed | refused (`REQUIRE_SIGN_IN`, on with `ldap`) |
| Test login routes (`/login`, `/unified-login`, ...) | mounted | off |

With `AUTH_MODE=ldap`, `POST /temp-login` accepts `first.last`, `First.Last@zemenbank.com` or
`Zemenbank\first.last`. It finds the person's record by the `user` field or email, then binds to
Active Directory as `Zemenbank\first.last` (the self-service app does the same). Empty passwords
are refused before AD is contacted, because AD treats them as an anonymous bind.

People in the database are matched by their username. If someone's AD username differs from
the `user` field or the part of their email before `@`, correct their record.

`admin@votingsystem.com` is not in AD. It signs in only because it is listed in
`LOCAL_ADMIN_EMAILS`, and only with a password set by `scripts/setPassword.js`. The test and
import default passwords are refused.

## Server prerequisites

- IIS with **URL Rewrite 2.1** and **iisnode** (x64).
- **Node.js** 18 or later, installed for all users so `node` is on the system PATH (iisnode runs
  `node`). Development uses Node 22.
- **MongoDB**, either on the server or reachable from it, plus the MongoDB Database Tools
  (`mongodump` and `mongorestore`) for copying data.
- The server can reach the domain controller on port 389:
  `Test-NetConnection mbdcp06.zemenbank.local -Port 389`.

## 1. Database

Copy the data from the development machine:

```powershell
# development machine
mongodump --db voting_system --archive=voting_system.archive --gzip

# server (add --drop only when replacing a copy that is already there)
mongorestore --archive=voting_system.archive --gzip
```

## 2. API (this repository)

```powershell
git clone https://github.com/RobelBethelhem/voting_backend.git D:\inetpub\zbvs-api
cd D:\inetpub\zbvs-api
npm ci --omit=dev --ignore-scripts
copy .env.example .env
mkdir iisnode
```

`--ignore-scripts` skips building `canvas`. Nothing uses it, and it has no Windows build for
current Node versions. `bcrypt` ships a Windows prebuild, so it works without its script.

Edit `.env` on the server. Don't copy the development `.env`:

```ini
DB=mongodb://127.0.0.1:27017/voting_system
SALT=10
# New random values for this server:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
ACCESS_TOKEN_PRIVATE_KEY=<random>
REFRESH_TOKEN_PRIVATE_KEY=<another random>
API_PREFIX=/zbvs/api
CORS_ORIGINS=https://aps2.zemenbank.com
AUTH_MODE=ldap
LDAP_URL=ldap://mbdcp06.zemenbank.local:389
LDAP_DOMAIN=Zemenbank
EMAIL_DOMAIN=zemenbank.com
LOCAL_ADMIN_EMAILS=admin@votingsystem.com
```

Leave `PORT` out: iisnode gives the app a named pipe.

Then set the local admin password (12 characters or more):

```powershell
node scripts/setPassword.js admin@votingsystem.com
```

`web.config` sends every request to `run.cjs`, which loads `app.js`. Compared with the
self-service app's file, it turns iisnode debugging and error pages off, hides `.env`,
`node_modules` and `iisnode`, and allows 30 MB requests for Excel imports.

## 3. Frontend

Build on the development machine. Use PowerShell or cmd: Git Bash has crashed during this build.

```powershell
cd D:\Voting\voting
npm run build
```

Copy the contents of `build\` (including `web.config`) to `D:\inetpub\zbvs` on the server. The
build calls the API at `/zbvs/api` (`src/api/base.js`). For another path, put
`VITE_API_BASE=/other/api` in `.env.production.local` before building.

## 4. IIS

1. Create an application pool `zbvs` with **.NET CLR version: No Managed Code**.
2. On the site that serves `aps2.zemenbank.com`, add an application with alias `zbvs`, physical
   path `D:\inetpub\zbvs`, and pool `zbvs`.
3. Inside `zbvs`, add an application with alias `api`, physical path `D:\inetpub\zbvs-api`,
   and pool `zbvs`. Its path is `/zbvs/api`.
4. Give the pool identity `IIS AppPool\zbvs` **Read & execute** on both folders, and **Modify**
   on `D:\inetpub\zbvs-api\uploads` (Excel imports) and `D:\inetpub\zbvs-api\iisnode` (logs).

The frontend `web.config` uses `inheritInChildApplications="false"`, so its settings don't
reach the nested API application.

## 5. Check it

- `https://aps2.zemenbank.com/zbvs/api/fiscal-years/current` returns
  `401 {"message":"Please sign in"}`. That shows IIS, iisnode and the routes are working.
- `https://aps2.zemenbank.com/zbvs/` shows the login page. Sign in with a domain username.
- Domain login answers "Domain login is unavailable right now": the server can't reach
  `LDAP_URL`. Check port 389 as above.
- Errors from Node are in `D:\inetpub\zbvs-api\iisnode\`.

## Updating

```powershell
cd D:\inetpub\zbvs-api
git pull
npm ci --omit=dev --ignore-scripts   # only when package-lock.json changed
```

Then recycle the `zbvs` application pool. iisnode restarts by itself only when `.env` or a
top-level `.js` file changes. For the frontend, build again and replace the files in
`D:\inetpub\zbvs`.

## Security notes

- The first commit of this repository included the development `.env` (JWT signing keys and
  SALT), and the repository is public. Never reuse those values. Give the server its own
  secrets, as above.
- Signing in proves who someone is. Many admin routes still don't check the role (`isAdmin`
  in `routes/adminRoutes.js`, `quotaRoutes.js` and `templateRoutes.js` lets every request
  through), so any signed-in employee could call them directly.
