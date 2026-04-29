import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").take(100);
  },
});

export const checkDuplicate = query({
  args: { projectName: v.string() },
  handler: async (ctx, args): Promise<Doc<"projects"> | null> => {
    const all = await ctx.db.query("projects").order("desc").take(100);
    const lower = args.projectName.toLowerCase();
    const match = all.find(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        lower.includes(p.name.toLowerCase()),
    );
    return match ?? null;
  },
});

export const seedFromCSV = mutation({
  args: {
    projects: v.array(
      v.object({
        name: v.string(),
        developer: v.string(),
        area: v.optional(v.string()),
        state: v.string(),
        completion_year: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("projects").order("desc").take(1000);
    const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));

    let inserted = 0;
    let skipped = 0;

    for (const project of args.projects) {
      const nameLower = project.name.toLowerCase();
      const isDuplicate = [...existingNames].some(
        (n) => n.includes(nameLower) || nameLower.includes(n),
      );
      if (isDuplicate) {
        skipped++;
        continue;
      }
      await ctx.db.insert("projects", {
        name: project.name,
        developer: project.developer,
        area: project.area ?? "",
        state: project.state,
        completion_year: project.completion_year ?? 0,
        source: "sheet",
      });
      existingNames.add(nameLower);
      inserted++;
    }

    return { inserted, skipped };
  },
});
