import { z } from "zod/mini";
import { themes } from "./themes.ts";
import { cardLayouts } from "./devcard.ts";
import { patterns } from "./patterns.ts";

export const githubUsernameSchema = z.string().check(
  z.regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i, "Enter a valid GitHub username."),
  z.refine((value) => !value.includes("--"), "Enter a valid GitHub username."),
);

export const devcardQuerySchema = z.object({
  username: githubUsernameSchema,
  theme: z.catch(z.enum(Object.keys(themes)), "sky"),
  pattern: z.enum(Object.keys(patterns), { error: "Invalid shape." }),
  layout: z.enum(Object.keys(cardLayouts) as (keyof typeof cardLayouts)[], {
    error: "Invalid layout.",
  }),
  org: z.union([z.literal(""), githubUsernameSchema], { error: "Invalid organization GitHub ID." }),
});
