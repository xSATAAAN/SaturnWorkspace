import assert from "node:assert/strict"
import test from "node:test"

import {
  assertArtifactBinarySignature,
  compareReleaseVersions,
} from "./releaseContract.js"

test("accepts an installed ZIP independently of its filename", () => {
  assert.doesNotThrow(() => assertArtifactBinarySignature(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), "installed"))
})

test("rejects a renamed non-ZIP installed artifact", () => {
  assert.throws(
    () => assertArtifactBinarySignature(Uint8Array.from([0x4d, 0x5a, 0x00, 0x00]), "installed"),
    /invalid_file_content/,
  )
})

test("accepts a portable executable by content", () => {
  assert.doesNotThrow(() => assertArtifactBinarySignature(Uint8Array.from([0x4d, 0x5a]), "portable"))
})

test("compares numeric versions and prerelease stages", () => {
  assert.equal(compareReleaseVersions("1.1.3-beta", "1.1.2-beta"), 1)
  assert.equal(compareReleaseVersions("1.1.2-beta", "1.1.2-beta"), 0)
  assert.equal(compareReleaseVersions("1.1.2-beta", "1.1.2"), -1)
  assert.equal(compareReleaseVersions("1.1.2-rc1", "1.1.2-beta9"), 1)
})
