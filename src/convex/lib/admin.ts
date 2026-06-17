import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { assertFound, forbidden } from './errorMapper';

/**
 * Reads the comma-separated `ADMIN_USER_IDS` env allowlist into a set of Clerk
 * user IDs. Empty/unset means "no admins" — the gate fails closed.
 */
function getAdminUserIds(): Set<string> {
	const raw = process.env.ADMIN_USER_IDS ?? '';
	return new Set(
		raw
			.split(',')
			.map((id) => id.trim())
			.filter((id) => id.length > 0)
	);
}

/**
 * Guard for internal-only template management (plan §7). Verifies the caller is
 * authenticated, resolves the local user, and confirms their Clerk id is in the
 * `ADMIN_USER_IDS` allowlist. Throws (401/404/403) otherwise. Returns the user doc.
 *
 * This is the server-side enforcement that backs the hidden /internal route — the
 * gate never relies on the route alone.
 */
export async function assertAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'>> {
	const identity = assertFound(
		await ctx.auth.getUserIdentity(),
		'Please log in to continue',
		true
	);

	const clerkId = identity.subject;

	const user = assertFound(
		await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
			.unique(),
		'User not found',
		true
	);

	if (!getAdminUserIds().has(clerkId)) {
		forbidden('Admin access required');
	}

	return user;
}
