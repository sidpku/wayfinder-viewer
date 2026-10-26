"""Read-only GitHub adapter. Tokens remain inside the installed gh CLI."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import re
import subprocess
from model import build_snapshot, issue_repo, issue_key


class GithubError(RuntimeError):
    pass


def validate_repo(repo):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repo or ''):
        raise ValueError('仓库请填写 owner/repo，例如 owner/repo。')
    return repo


def decode_pages(raw):
    pages = json.loads(raw)
    if not isinstance(pages, list) or any(not isinstance(page, list) for page in pages):
        raise GithubError('GitHub 分页返回了无法识别的数据。')
    return [item for page in pages for item in page]


def gh(endpoint, paged=False):
    command = ['gh', 'api', endpoint, '-H', 'Accept: application/vnd.github+json']
    if paged:
        command += ['--paginate', '--slurp']
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    except FileNotFoundError as exc:
        raise GithubError('未找到 gh，请先安装 GitHub CLI 并使用 gh auth login 登录。') from exc
    except subprocess.TimeoutExpired as exc:
        raise GithubError('GitHub 请求超时，请检查网络后重试。') from exc
    if result.returncode:
        err = result.stderr.lower()
        if '404' in err:
            message = 'GitHub 未找到该资源，或当前登录账号没有访问权限。'
        elif '401' in err or 'auth login' in err or 'token' in err:
            message = 'GitHub 登录不可用，请在终端使用 gh auth login 登录。'
        elif 'rate limit' in err:
            message = 'GitHub 请求额度暂时用尽，请稍后刷新。'
        else:
            message = '无法连接 GitHub，请检查本机网络、代理和 gh 登录状态。'
        raise GithubError(message)
    try:
        return decode_pages(result.stdout) if paged else json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        raise GithubError('GitHub 返回了无法识别的数据。') from exc


def list_maps(repo):
    validate_repo(repo)
    issues = gh(f'repos/{repo}/issues?labels=wayfinder%3Amap&state=all&per_page=100', True)
    return [{'number': i['number'], 'title': i['title'], 'state': i['state'], 'url': i['html_url']}
            for i in issues if 'pull_request' not in i]


def load_map(repo, number):
    validate_repo(repo)
    if not isinstance(number, int) or number <= 0:
        raise ValueError('地图议题编号必须为正整数。')
    base = f'repos/{repo}/issues'
    map_issue = gh(f'{base}/{number}')
    if 'wayfinder:map' not in [label['name'] for label in map_issue.get('labels', [])]:
        raise ValueError('该议题没有 wayfinder:map 标签，请选择 Wayfinder 地图。')
    children = gh(f'{base}/{number}/sub_issues?per_page=100', True)
    dependencies, comments, warnings = {}, {}, []
    jobs = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for child in children:
            n = issue_key(child, repo)
            child_base = f"repos/{validate_repo(issue_repo(child, repo))}/issues/{child['number']}"
            jobs[pool.submit(gh, f'{child_base}/dependencies/blocked_by?per_page=100', True)] = (n, 'dependencies')
            if child.get('comments', 0):
                jobs[pool.submit(gh, f'{child_base}/comments?per_page=100', True)] = (n, 'comments')
            else:
                comments[n] = []
        for future in as_completed(jobs):
            n, kind = jobs[future]
            try:
                result = future.result()
                if kind == 'dependencies':
                    dependencies[n] = result
                else:
                    comments[n] = [{'body': c['body'], 'url': c['html_url'],
                                    'author': c.get('user', {}).get('login', ''),
                                    'createdAt': c['created_at']} for c in result]
            except GithubError as exc:
                title = next(i['title'] for i in children if issue_key(i, repo) == n)
                warnings.append(f'“{title}”的{"前置关系" if kind == "dependencies" else "评论"}读取失败：{exc}')
    return build_snapshot(repo, map_issue, children, dependencies, comments, warnings)
