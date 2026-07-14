import assert from "node:assert/strict"
import test from "node:test"

import {
  artifactVersionFromFilename,
  assertArtifactVersionMatchesFilename,
} from "./releaseContract.js"

test("extracts installed package version including prerelease suffix", () => {
  assert.equal(
    artifactVersionFromFilename("SaturnWorkspace-app-1.1.2-beta.zip", "installed"),
    "1.1.2-beta",
  )
})

test("rejects a manifest version that disagrees with the installed package", () => {
  assert.throws(
    () => assertArtifactVersionMatchesFilename("SaturnWorkspace-app-1.1.2-beta.zip", "installed", "1.1.2"),
    /release_version_filename_mismatch/,
  )
})

test("rejects an installed package outside the build naming contract", () => {
  assert.throws(
    () => assertArtifactVersionMatchesFilename("update.zip", "installed", "1.1.2-beta"),
    /release_artifact_filename_invalid/,
  )
})

test("accepts a matching installed package", () => {
  assert.equal(
    assertArtifactVersionMatchesFilename("SaturnWorkspace-app-1.1.2-beta.zip", "installed", "1.1.2-beta"),
    "1.1.2-beta",
  )
})
