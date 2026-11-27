import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePeer } from "./dispatch.js";

describe("normalizePeer", () => {
  it("strips spaces, dashes, and parentheses", () => {
    assert.equal(normalizePeer(" +63 (917) 123-4567 "), "+639171234567");
    assert.equal(normalizePeer("+12025550123"), "+12025550123");
  });
});
