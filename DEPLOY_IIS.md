# Deploying to IIS

The server layout matches the self-service app (`C:\inetpub\wwwroot\zbss`). Both parts are
installed and updated with `git pull`:

| Folder | What it is | Git repository | IIS application |
| --- | --- | --- | --- |
| `C:\inetpub\wwwroot\zbvs` | frontend repo; the site is its `build\` folder | `voting` | `/zbvs` → `...\zbvs\build` |
| `C:\inetpub\wwwroot\zbvs\Server` | this repository (iisnode) | `voting_backend` | `/zbvs/api` → `...\zbvs\Server` |

The frontend's `build\` is committed, so the server doesn't need to build anything. The site is
`https://aps2.zemenbank.com/zbvs/`, and it calls the API on the same origin at `/zbvs/api`.

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

The self-service app already needs all of these:

- IIS with **URL Rewrite 2.1** and **iisnode** (x64).
- **Node.js** 18 or later on the system PATH, plus **git**.
- **MongoDB**, on the server or reachable from it.
- The server can reach the domain controller: `Test-NetConnection mbdcp06.zemenbank.local -Port 389`.

## First installation

Run in PowerShell as Administrator. `C:\inetpub\wwwroot\zbvs` must be empty, or not exist yet.

```powershell
# 1. Get the code
cd C:\inetpub\wwwroot
git clone -b iis-deployment https://github.com/RobelBethelhem/voting.git zbvs
cd zbvs
git clone -b iis-deployment https://github.com/RobelBethelhem/voting_backend.git Server

# 2. Install the API's packages
cd Server
npm ci --omit=dev --ignore-scripts
mkdir iisnode
```

`--ignore-scripts` skips building `canvas`. Nothing uses it, and it has no Windows build for
current Node versions. `bcrypt` ships a Windows prebuild, so it works without its script.

**3. Create `.env`.** It is never in git, because it holds the signing keys. This writes it
with new random keys and the server settings (`.env.example` lists them):

```powershell
node scripts\createServerEnv.js
```

That assumes MongoDB on this server (`mongodb://127.0.0.1:27017/voting_system`). If MongoDB runs
elsewhere or needs a user, give the connection instead:
`node scripts\createServerEnv.js "mongodb://user:pass@host:27017/voting_system?authSource=admin"`.

**4. Load the data and set the admin password.** The data isn't in git (it holds employee
records). Copy the exported `database` folder to the server, then:

```powershell
cd C:\inetpub\wwwroot\zbvs\Server
node C:\path\to\database\db-import.mjs
node scripts\setPassword.js admin@votingsystem.com     # 12+ characters
```

**5. IIS**

```powershell
Import-Module WebAdministration
New-WebAppPool -Name zbvs
Set-ItemProperty IIS:\AppPools\zbvs -Name managedRuntimeVersion -Value ""

# /zbvs serves the build, /zbvs/api runs the API
# (change "Default Web Site" if aps2 is served by another site)
New-WebApplication -Site "Default Web Site" -Name zbvs -PhysicalPath C:\inetpub\wwwroot\zbvs\build -ApplicationPool zbvs
New-WebApplication -Site "Default Web Site\zbvs" -Name api -PhysicalPath C:\inetpub\wwwroot\zbvs\Server -ApplicationPool zbvs

# The API writes Excel uploads and its logs
icacls C:\inetpub\wwwroot\zbvs\Server\uploads /grant "IIS AppPool\zbvs:(OI)(CI)M"
icacls C:\inetpub\wwwroot\zbvs\Server\iisnode /grant "IIS AppPool\zbvs:(OI)(CI)M"
```

In IIS Manager this is:

1. Add the application pool `zbvs` with No Managed Code.
2. On the site, add an application with alias `zbvs` and path `...\zbvs\build`.
3. Under `zbvs`, add an application with alias `api` and path `...\zbvs\Server`.

The applications point at `build` and `Server`, so the repository files around them are never
served. The frontend's `web.config` uses `inheritInChildApplications="false"`, so its settings
stay out of `/zbvs/api`.

**6. Check it**

- `https://aps2.zemenbank.com/zbvs/api/fiscal-years/current` returns
  `{"error":true,"message":"Please sign in"}`. That shows IIS, iisnode and the API are working.
- `https://aps2.zemenbank.com/zbvs/` shows the login page. Sign in with a domain username.
- Domain login answers "Domain login is unavailable right now": the server can't reach
  `LDAP_URL`. Check port 389 as above.
- Errors from Node are in `C:\inetpub\wwwroot\zbvs\Server\iisnode\`.

## Updating

On the development machine, before pushing a frontend change, run `npm run build` (in
PowerShell) and commit `build/` with the source. On the server:

```powershell
cd C:\inetpub\wwwroot\zbvs
git pull
cd Server
git pull
npm ci --omit=dev --ignore-scripts   # only when package-lock.json changed
Restart-WebAppPool zbvs
```

## Security notes

- The first commit of this repository included the development `.env` (JWT signing keys and
  SALT), and the repository is public. Never reuse those values. Give the server its own
  secrets, as above.
- Signing in proves who someone is. Many admin routes still don't check the role (`isAdmin`
  in `routes/adminRoutes.js`, `quotaRoutes.js` and `templateRoutes.js` lets every request
  through), so any signed-in employee could call them directly.
