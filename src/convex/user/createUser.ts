import { v } from 'convex/values';
import  { mutation } from '../_generated/server';


export const createUser = mutation({
    args: {
        email: v.string(),
        fullName: v.string(),
        imageUrl: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();

        if (!identity) { throw new Error("Not authorized")}
        const clerkId = identity.subject;

        const existing = await ctx.db.query('users').withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId)).unique();

        if (existing) return

        const payload = {
            clerkUserId: clerkId,
            email: args.email,
            fullName: args.fullName,
            imageUrl: args.imageUrl,
            status: 'active' as const,
            createdAt: new Date().getTime(),
            updatedAt: new Date().getTime(),
        }

        return await ctx.db.insert('users', payload)
    }
})