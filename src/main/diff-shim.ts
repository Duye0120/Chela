import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const diff = require("diff") as typeof import("diff");

export const { createTwoFilesPatch, parsePatch } = diff;
