// Sets the password of a local admin account, the ones outside Active Directory that sign in
// on the server through LOCAL_ADMIN_EMAILS (see DEPLOY_IIS.md). Creates the admin account when
// there is none with that email (e.g. on a new, empty database).
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
  const sameEmail = { email: new RegExp(`^${escapeRegex(email)}$`, 'i') };
  const filter = { ...sameEmail, roles: 'admin' };
  const exists = (await users.countDocuments(filter)) > 0;
  // Never turn a staff account into an admin
  if (!exists && (await users.countDocuments(sameEmail)) > 0) {
    throw new Error(`${email} belongs to an account that is not an admin`);
  }
  if (!exists) console.log(`No admin account with email ${email} yet: it will be created.`);

  const password = await ask('New password: ');
  if (password.length < 12) throw new Error('Use at least 12 characters');
  if ((await ask('Repeat password: ')) !== password) throw new Error('The passwords differ');

  const hash = await bcrypt.hash(password, 10);
  if (exists) {
    await users.updateMany(filter, { $set: { password: hash } });
    console.log(`Password updated for ${email}`);
  } else {
    // Admins are shared by every fiscal year. Appraisal score 0 keeps the account out of the
    // candidate qualification (score >= 60).
    await users.insertOne({
      first_name: 'Admin',
      last_name: 'User',
      employee_id: 'ADMIN001',
      user: email.split('@')[0].toLowerCase(),
      position: 'System Administrator',
      department: 'IT',
      email: email.toLowerCase(),
      password: hash,
      roles: ['admin'],
      level: 'professional',
      job_grade: 'Admin',
      function: 'Administration',
      performance_appraisal_score: 0,
      is_managerial: false,
      status: true,
      fiscal_year: null,
    });
    console.log(`Admin account ${email} created`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}
