// Creates .env for the IIS server (see DEPLOY_IIS.md), with new random signing keys, so no
// secrets ever go into git.
//
//   node scripts/createServerEnv.js
//   node scripts/createServerEnv.js mongodb://user:pass@dbhost:27017/voting_system?authSource=admin
//
// The optional argument is the MongoDB connection (default: MongoDB on this server).
// It won't replace an existing .env; delete that first to start again.
import { randomBytes } from 'crypto';
import { existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  console.error(`${envPath} already exists. Delete it first if you want a new one.`);
  process.exit(1);
}

const db = process.argv[2] || 'mongodb://127.0.0.1:27017/voting_system';
const key = () => randomBytes(48).toString('hex');

writeFileSync(envPath, `# Server settings for the voting API (IIS), made by scripts/createServerEnv.js

DB=${db}

SALT=10
ACCESS_TOKEN_PRIVATE_KEY=${key()}
REFRESH_TOKEN_PRIVATE_KEY=${key()}

# No PORT: iisnode provides it
API_PREFIX=/zbvs/api
CORS_ORIGINS=https://aps2.zemenbank.com

AUTH_MODE=ldap
LDAP_URL=ldap://mbdcp06.zemenbank.local:389
LDAP_DOMAIN=Zemenbank
EMAIL_DOMAIN=zemenbank.com
LOCAL_ADMIN_EMAILS=admin@votingsystem.com
`);

console.log(`Created ${envPath}`);
console.log(`MongoDB: ${db.replace(/\/\/[^@/]*@/, '//***@')}`);
