import {
  atomWithStorage,
  createJSONStorage,
  unstable_withStorageValidator as withStorageValidator,
} from "jotai/vanilla/utils";
import { cardLayouts, type CardLayout } from "@github-devcard/worker/devcard";
import { themes } from "@github-devcard/worker/themes";
import { patterns } from "@github-devcard/worker/patterns";

const jsonStorage = createJSONStorage<unknown>();
const stringStorage = withStorageValidator((value): value is string => typeof value === "string")(
  jsonStorage,
);
const themeStorage = withStorageValidator(
  (value): value is string => typeof value === "string" && Object.hasOwn(themes, value),
)(jsonStorage);
const patternStorage = withStorageValidator(
  (value): value is string => typeof value === "string" && Object.hasOwn(patterns, value),
)(jsonStorage);
const layoutStorage = withStorageValidator(
  (value): value is CardLayout => typeof value === "string" && Object.hasOwn(cardLayouts, value),
)(jsonStorage);
const options = { getOnInit: true };

export const usernameAtom = atomWithStorage(
  "github-devcard:username",
  "octocat",
  stringStorage,
  options,
);
export const themeAtom = atomWithStorage("github-devcard:theme", "sky", themeStorage, options);
export const patternAtom = atomWithStorage(
  "github-devcard:pattern",
  "leaf",
  patternStorage,
  options,
);
export const layoutAtom = atomWithStorage<CardLayout>(
  "github-devcard:layout",
  "portrait",
  layoutStorage,
  options,
);
export const orgAtom = atomWithStorage("github-devcard:org", "", stringStorage, options);
export const customLogoAtom = atomWithStorage(
  "github-devcard:custom-logo",
  "",
  stringStorage,
  options,
);
