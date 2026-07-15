import assert from "node:assert/strict"
import test from "node:test"

import {
  assertArtifactBinarySignature,
  compareReleaseVersions,
  mergeWhatsNewReleaseHistory,
  releaseTargetAudienceKey,
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

test("merges, deduplicates, and orders What is new releases", () => {
  const history = mergeWhatsNewReleaseHistory(
    [
      { version: "1.1.7", notes: "Seven old" },
      { version: "1.1.6", notes: "Six" },
    ],
    [
      { version: "1.1.7", build_id: "build-7", notes: "Seven current" },
      { version: "1.1.8", notes: { ar: ["ثمانية"], en: "Eight" } },
    ],
  )

  assert.deepEqual(history, [
    { version: "1.1.6", notes: "Six" },
    { version: "1.1.7", build_id: "build-7", notes: "Seven current" },
    { version: "1.1.8", notes: { ar: "ثمانية", en: "Eight" } },
  ])
})

test("ignores invalid or empty history entries and applies a bounded tail", () => {
  const releases = Array.from({ length: 30 }, (_, index) => ({
    version: `2.0.${index}`,
    notes: `Release ${index}`,
  }))
  releases.push({ version: "not-a-version", notes: "Invalid" })
  releases.push({ version: "3.0.0", notes: "" })

  const history = mergeWhatsNewReleaseHistory([], releases, 3)

  assert.deepEqual(history.map((item) => item.version), ["2.0.27", "2.0.28", "2.0.29"])
})

test("targeted release audiences are order-insensitive but identity-type specific", () => {
  const first = releaseTargetAudienceKey({
    user_emails: ["B@example.com", "a@example.com", "a@example.com"],
    device_ids: ["device-2", "device-1"],
  })
  const same = releaseTargetAudienceKey({
    user_emails: "a@example.com; b@example.com",
    device_ids: ["device-1", "device-2"],
  })
  const different = releaseTargetAudienceKey({
    user_ids: ["a@example.com", "b@example.com"],
    device_ids: ["device-1", "device-2"],
  })

  assert.equal(first, same)
  assert.notEqual(first, different)
})
