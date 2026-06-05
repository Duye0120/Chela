import assert from "node:assert/strict";

import { throwIfPendingTerminalError } from "../src/main/chat/terminal-error.ts";

assert.throws(
  () =>
    throwIfPendingTerminalError({
      getPendingTerminalErrorMessage: () =>
        "401 invalid access token or token expired",
    }),
  /401 invalid access token or token expired/,
);

assert.doesNotThrow(() =>
  throwIfPendingTerminalError({
    getPendingTerminalErrorMessage: () => null,
  }),
);

console.log("chat runtime error regression tests passed");
