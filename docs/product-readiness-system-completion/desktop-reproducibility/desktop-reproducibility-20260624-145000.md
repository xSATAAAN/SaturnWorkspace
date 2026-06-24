# Desktop Reproducibility Record

Status: `RECORDED_WITHOUT_REBUILD`

Generated at: `2026-06-24T11:50:05.2264929Z`

Desktop source root: `D:\SaturnWS\desktop-app`

Canonical repository: `D:\SaturnWS\github-deploy\SaturnWorkspace`

## Scope

This record hashes the external desktop source tree without copying it into Git history and without rebuilding the QA setup. Generated build output, caches, logs, local secrets, private keys, and credential-like files are excluded.

## Existing QA Setup

`D:\SaturnWS\build-output\phase-g-qa-installed-channel-20260624-131944\setup\SaturnWorkspace-Setup-1.0.7-beta-phase-g-qa.exe` / size 42469032 / SHA256 `527C21D6A87720DB31E0EC4A8F59EA6FF2299C928C1B83447E2AC1E6AAA45DDD`

## Manifest

Manifest path: `D:\SaturnWS\github-deploy\SaturnWorkspace\docs\product-readiness-system-completion\desktop-reproducibility\desktop-source-manifest-20260624-145000.json`

Source file count: `217`

## Excluded Paths and Files

Excluded directories: `node_modules`, `dist`, `build`, `build-output`, `__pycache__`, `.git`, `.venv`, `venv`, `.pytest_cache`, `.mypy_cache`, `logs`, `tmp`, `temp`, `cache`, `caches`, `local-secrets`, `private-backups`, `.ruff_cache`

Excluded file patterns: `.env*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*secret*`, `*credential*`, `*token*`, `*password*`, `google_drive_client*.json`, `private_update_signing_key*`.

## Dependency and Build Files

| Path | Size | SHA256 |
| --- | ---: | --- |
| `build_installed_repair_components.ps1` | 4305 | `04827CDCC79F03FC66E31823450657E70C8C8B9A02B9C5CC567D76E3B691B331` |
| `build_installed_channel.ps1` | 10461 | `5AB1677F944CE21CDDEEBD9A2195DCBE736084CFE7D5DF861FF0E1C401FD9A56` |
| `installer/SaturnWorkspace.iss` | 30188 | `157EB8B8CE7019EC127742F9CD5878CE5199502D6862A578519ECC39E3F533CE` |
| `build_installed_update_package.ps1` | 3143 | `9E1D17801CC174253E8258F85E3284712D1F646C8CB7C8C16F238FB45E1E0FC3` |
| `build.bat` | 279 | `D8FF8D513C8AB7179BB4C0F9604A14DD789663232CC798368D03137F53158361` |
| `build_onefile.ps1` | 9757 | `C64FA31A6EE951B0CFD55AB422A221FCCBBBC28A4EDDF49D8248A9AE0B08D238` |
| `build_installer_visual_test.ps1` | 1721 | `4B28624194F2996B87ED720BC31AD08A12FDC9B5EC0BC84FA8EAC575858A5C1C` |
| `src/backend/requirements.txt` | 17 | `27EABF3AC1C5F06A7635A7793FA32E672E2B5E425D796AD63B615FA9D7B81A32` |
| `requirements.txt` | 176 | `DB50FF3ABDB457542DC74FA3DE7CEFF09C55EA4B73A2E3D3F91F273FFE244741` |
| `src/frontend/package-lock.json` | 93513 | `1362A45E3A4ABBC2EFD78B29AB9B4FC26669F8257D7307456B2B6D553DB7BD2A` |
| `pyinstaller.app-onedir.spec` | 2813 | `83D9C969147985A4D25B477357A5143104712650F22B451DF47BADE8C9A8D378` |
| `pyinstaller.update-helper.spec` | 627 | `3E044D49923C551B76DC6406F0512830D181C67B3A618EB9423BF0CB4E646B36` |
| `pyinstaller.spec` | 3522 | `D4454EC5EF994F31542D87C403E4008985A105B9FAC361892412C7CCFA518E1E` |
| `pyinstaller.launcher.spec` | 618 | `0D1A4C5E3F43714CE8D17B3951F187AEB9E172BF7F77138E8F20857DD717370E` |

## Source Extension Summary

| Extension | Count |
| --- | ---: |
| .py | 109 |
| .png | 22 |
| .json | 16 |
| .css | 8 |
| .ts | 8 |
| .ttf | 7 |
| .tsx | 7 |
| .js | 6 |
| .ps1 | 5 |
| .svg | 5 |
| .spec | 4 |
| .txt | 4 |

## Build Command

No rebuild was executed for this record. Future reproducible QA builds should run the existing installed-channel desktop build script from the desktop app workspace, record the exact source manifest, version input, build log, setup path, size, and SHA256, and keep private signing/OAuth material outside source and build output.

## Source Control Recommendation

Move desktop source into a dedicated private Git repository or a private submodule/subtree with explicit `.gitignore` rules for local secrets, build output, update signing keys, OAuth debug files, logs, caches, and generated installers. Keep setup and OTA artifacts in build-output or release storage, not in source history.
