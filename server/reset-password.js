// Admin escape hatch for a forgotten password.
// Usage: npm run reset-password -- <email> <new-password>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error('Usage: npm run reset-password -- <email> <new-password>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const result = await client.query(
      'UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2) RETURNING id, email, name',
      [hash, email]
    );
    if (result.rows.length === 0) {
      console.error(`❌ No account found for ${email}`);
      process.exit(1);
    }
    console.log(`✅ Password reset for ${result.rows[0].name} (${result.rows[0].email})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Failed to reset password:', err.message);
  process.exit(1);
});
