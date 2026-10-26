# Wayfinder Viewer

English | [简体中文](README.zh-CN.md)

A lightweight, local viewer for Wayfinder decision maps stored in GitHub Issues. Explore decisions, blockers, and discussions on an interactive canvas, then export a self-contained HTML snapshot.

## Background and inspiration

Planning a large project often spreads questions, decisions, and dependencies across many issues. Wayfinder Viewer brings those relationships together so you can see what is ready to discuss, what is blocked, and how each decision connects to the goal.

Inspired by **Matt Pocock’s [Wayfinder skill](https://github.com/mattpocock/skills/tree/main/skills/engineering/wayfinder)** in [mattpocock/skills](https://github.com/mattpocock/skills). Its approach organizes planning as a map of decision tickets, with a destination and a frontier of unblocked, unclaimed questions. This project adds an independent visual reader for the GitHub representation of that workflow; it is not an official Matt Pocock or GitHub product.

## Pure vibe coding

**This is a pure vibe-coded project.** It was built through natural-language conversations with an AI coding agent, with humans directing requirements and reviewing the result. This describes the development process, not a guarantee of correctness or a security audit. Tests and contributions are welcome.

## Features

- Interactive dependency graph with pan, zoom, search, status/type filters, and upstream/downstream focus.
- Decision details, comments, map description, and links back to GitHub.
- A ready-to-start frontier, based on native GitHub sub-issues, blockers, and assignees.
- Repository/map switching, collapsible sidebars, and a mobile list view.
- Local snapshot caching, explicit refresh, and standalone offline HTML export.
- Python standard library backend and plain HTML/CSS/JavaScript; no build step or third-party runtime packages.

The application UI currently uses Simplified Chinese. English and Chinese documentation are provided; an English UI is not yet included.

## Quick start

Requirements: Python 3.10+, [GitHub CLI](https://cli.github.com/), and a GitHub account with read access to the target repository.

1. Download this repository, or clone it, and open a terminal in its directory.
2. Authenticate and start:

```sh
gh auth login
python3 server.py
```

The browser opens at `http://127.0.0.1:8766`. Choose your repository (`owner/repo`) and map issue number. No personal repository is configured or fetched by default. On macOS, you can also double-click `start.command`.

To select a map at startup:

```sh
python3 server.py --repo owner/repo --map 1 --port 8766
```

Replace `owner/repo` and `1` with your own repository and map issue number. Add `--no-browser` to skip automatically opening a browser. Stop with Ctrl+C.

## Preparing a map

In GitHub, create a parent issue labeled `wayfinder:map`, add decision issues as its **native sub-issues**, and connect prerequisites using **native blocking relationships**. Markdown links or task lists alone do not create these relationships.

Optional decision labels are `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task`. The map body can use `## Destination`, `## Notes`, `## Decisions so far`, `## Not yet specified`, and `## Out of scope` sections. The viewer reads existing maps; it does not create or modify issues.

## Using the viewer

Select a node or list item to read its question and discussion. Drag to pan and scroll to zoom; arrow keys pan, `+` / `-` zoom, and `0` fits the graph. Focus shows the selected decision’s upstream/downstream chain. The repository button switches maps or finds issues labeled `wayfinder:map`.

Opening a map uses its local snapshot when available; otherwise it loads from GitHub. Refresh retrieves new data. Failed refreshes keep the previous snapshot; partial reads show warnings.

Export HTML saves the current snapshot as a standalone file that opens without the server. It cannot refresh GitHub. To export an already cached map from the command line:

```sh
python3 server.py --repo owner/repo --map 1 --export wayfinder-map.html
```

## State semantics and limits

| State | Meaning |
| --- | --- |
| Closed | GitHub issue is closed; this does not certify acceptance or a valid decision. |
| Ready | Open, unassigned, and every blocker is closed. |
| Blocked | At least one prerequisite is open. |
| Claimed | Open and assigned, with no open blockers; this does not mean an agent is running. |
| Unknown | Dependencies could not be fully read; readiness is not inferred. |

Only direct sub-issues and their direct blockers are loaded. External blockers retain their repository identity and GitHub links. Nested sub-issues are not recursively expanded. Comments are displayed without automatically choosing an authoritative resolution. Snapshots are not atomic: concurrent GitHub edits may require another refresh. Times in the current UI are displayed in Asia/Shanghai.

## Privacy and deployment

This is publicly shareable source for a **local desktop tool**, not a hosted multi-user service. It binds to `127.0.0.1`, uses read-only GitHub requests through your installed `gh`, and does not embed your authentication token in pages or exports. Keep it local; authentication for public hosting is not implemented.

`.cache/` contains issue bodies, relationships, assignees, and comments. Exported HTML contains snapshot data too, including private repository content if you load it. Review exports before sharing. Caches, exported HTML, credentials, and private design references are excluded by `.gitignore`; share source files rather than your entire working folder. Delete `.cache/` to remove local snapshots.

Deleting a sensitive file from the latest version does **not** remove it from Git history. Before publishing an existing repository, inspect its history and release assets, remove sensitive historical content or publish a clean source copy, and rotate any exposed credentials.

## Development

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
```

Node.js is only needed for the JavaScript syntax check. Python tests cover state derivation, missing/cross-repository blockers, pagination, target validation, cache preservation, and export escaping. They do not replace live GitHub or browser compatibility testing.

Bug reports and pull requests are welcome. Use synthetic examples and redact repository content, tokens, and personal details from reports and screenshots. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). You may use, modify, distribute, and use this software commercially, subject to retaining the copyright and permission notice. The software is provided without warranty. Inspiration does not imply endorsement; upstream projects retain their own licenses.
