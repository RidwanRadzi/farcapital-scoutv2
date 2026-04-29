import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    developer: v.string(),
    area: v.string(),
    state: v.string(),
    completion_year: v.number(),
    verdict: v.optional(v.string()),
    pic: v.optional(v.string()),
    date_studied: v.optional(v.string()),
    source: v.string(),
  }),
  search_results: defineTable({
    project_name: v.string(),
    developer: v.optional(v.string()),
    area: v.string(),
    confidence: v.string(),
    source_urls: v.array(v.string()),
    raw_content: v.string(),
    searched_at: v.number(),
  }),
});
