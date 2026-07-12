# Repository security gate

Run from the canonical repository:

```powershell
node tools/security/repository-check.mjs
```

The gate scans Git-tracked text files only. It fails on high-confidence credentials,
private keys, credentialed URLs, sensitive tracked filenames, or any tracked path named
`secret (dont read)`. Lower-confidence code patterns are emitted under `manualReview`
and require source-level validation rather than automatic failure.
