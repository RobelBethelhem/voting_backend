// Sets the password of a local admin account, the ones outside Active Directory that sign in
// on the server through LOCAL_ADMIN_EMAILS (see DEPLOY_IIS.md).
//
//   node scripts/setPassword.js admin@votingsystem.com
//
// Uses DB from .env and asks for the new password, which must be at least 12 characters.
import { config } from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import readline from 'readline';

config();

const email = (process.argv[2] || '').trim();
if (!email) {
  console.error('Usage: node scripts/setPassword.js <admin email>');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// Don't echo what is typed
rl._writeToOutput = () => {};
// Buffers lines from the start, so piped input works too
const lines = rl[Symbol.asyncIterator]();
const ask = async (question) => {
  process.stdout.write(question);
  const { value } = await lines.next();
  process.stdout.write('\n');
  return value || '';
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

try {
  await mongoose.connect(process.env.DB);
  const users = mongoose.connection.db.collection('users');
  const filter = { email: new RegExp(`^${escapeRegex(email)}$`, 'i'), roles: 'admin' };
  const count = await users.countDocuments(filter);
  if (count === 0) throw new Error(`No admin account with email ${email}`);

  const password = await ask('New password: ');
  if (password.length < 12) throw new Error('Use at least 12 characters');
  if ((await ask('Repeat password: ')) !== password) throw new Error('The passwords differ');

  const hash = await bcrypt.hash(password, 10);
  await users.updateMany(filter, { $set: { password: hash } });
  console.log(`Password updated for ${email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}
