# Contributing

Report bugs with reproduction steps, Python/browser versions, expected behavior, and actual behavior. Use synthetic issue data; never attach private exports, caches, tokens, or unredacted screenshots.

Keep changes focused. Preserve the local-only, read-only design and avoid adding runtime dependencies without explaining why. Update both README files when changing setup or behavior. Add regression coverage for changes to state rules, GitHub parsing, or privacy boundaries.

Before submitting a pull request, run:

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
```

Describe which checks you ran and any unverified behavior. Contributions are provided under the repository’s MIT license.
