"""Wayfinder states derived only from native GitHub issue relationships."""
from datetime import datetime, timezone
import re


def sections(body):
    result = {}
    current = None
    lines = []
    fence = None
    for line in (body or '').splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            char = marker[1][0]
            if fence is None:
                fence = char
            elif char == fence:
                fence = None
        heading = re.match(r'^##\s+(.+?)\s*$', line) if fence is None and not marker else None
        if heading:
            if current:
                result[current] = '\n'.join(lines).strip()
            current, lines = heading[1], []
        else:
            lines.append(line)
    if current:
        result[current] = '\n'.join(lines).strip()
    return result


def classify(issue, blockers, known=True):
    if issue.get('state') == 'closed':
        return 'closed'
    if not known or any(b.get('state') not in ('open', 'closed') for b in blockers):
        return 'unknown'
    if any(b['state'] == 'open' for b in blockers):
        return 'blocked'
    return 'claimed' if issue.get('assignees') else 'frontier'


def issue_repo(issue, default_repo):
    match = re.match(r'https://github\.com/([^/]+/[^/]+)/issues/\d+', issue.get('html_url') or '')
    if not match:
        match = re.match(r'https://api\.github\.com/repos/([^/]+/[^/]+)$', issue.get('repository_url') or '')
    return match[1] if match else default_repo


def issue_key(issue, default_repo):
    return f"{issue_repo(issue, default_repo)}#{issue['number']}"


def normalize(issue, default_repo):
    labels = [l['name'] if isinstance(l, dict) else l for l in issue.get('labels', [])]
    kind = next((x.removeprefix('wayfinder:') for x in labels
                 if x in ('wayfinder:research', 'wayfinder:prototype', 'wayfinder:grilling', 'wayfinder:task')), 'task')
    return {key: issue.get(key) for key in ('number', 'title', 'state', 'body', 'state_reason', 'created_at', 'updated_at', 'closed_at')} | {
        'url': issue.get('html_url'), 'labels': labels, 'type': kind,
        'repo': issue_repo(issue, default_repo), 'key': issue_key(issue, default_repo),
        'assignees': [a['login'] for a in issue.get('assignees', [])],
    }


def build_snapshot(repo, map_issue, children, dependencies, comments, warnings):
    keys = {issue_key(i, repo) for i in children}
    issues, external, edges = [], {}, []
    for child in children:
        key = issue_key(child, repo)
        blockers = dependencies.get(key, [])
        item = normalize(child, repo)
        item.update(status=classify(child, blockers, key in dependencies),
                    dependenciesKnown=key in dependencies,
                    blockedBy=[issue_key(b, repo) for b in blockers],
                    comments=comments.get(key, []))
        issues.append(item)
        for blocker in blockers:
            blocker_key = issue_key(blocker, repo)
            edges.append({'source': blocker_key, 'target': key})
            if blocker_key not in keys:
                external[blocker_key] = normalize(blocker, repo) | {'external': True, 'status': 'closed' if blocker.get('state') == 'closed' else 'external'}
    return {
        'schemaVersion': 2, 'repo': repo, 'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'map': normalize(map_issue, repo) | {'sections': sections(map_issue.get('body'))},
        'issues': issues, 'external': list(external.values()), 'edges': edges,
        'frontier': [i['key'] for i in issues if i['status'] == 'frontier'],
        'warnings': warnings,
    }
