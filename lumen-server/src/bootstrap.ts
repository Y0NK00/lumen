import { countUsers, createUser, getUserByEmail } from './db/repos/users.js';
import { logger } from './lib/logger.js';

/**
 * Create the admin user if no users exist yet.
 * Idempotent: subsequent boots do nothing.
 */
export async function bootstrapAdmin(): Promise<void> {
  if (countUsers() > 0) {
    return;
  }
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME || 'Admin';

  if (!email || !password) {
    logger.error('No users exist and ADMIN_BOOTSTRAP_EMAIL/PASSWORD not set. Server will start but no login is possible.');
    return;
  }

  const existing = getUserByEmail(email.toLowerCase());
  if (existing) return;

  const user = await createUser({
    email,
    password,
    displayName,
    role: 'admin',
    monthlyBudgetUsd: 100,
  });
  logger.info({ userId: user.id, email: user.email }, 'bootstrap: admin user created');
  logger.warn('Change the admin password in the UI after first login.');
}
