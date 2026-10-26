#!/usr/bin/env python3
"""Loopback-only viewer server, backed by read-only gh calls."""
import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import parse_qs, urlparse
import webbrowser
from github import GithubError, list_maps, load_map, validate_repo

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'web'


def parse_target(query):
    repo = validate_repo(query.get('repo', [''])[0])
    try:
        number = int(query.get('number', ['1'])[0])
    except (ValueError, TypeError):
        raise ValueError('地图议题编号必须为正整数。')
    if number < 1:
        raise ValueError('地图议题编号必须为正整数。')
    return repo, number


class SnapshotStore:
    def __init__(self, directory):
        self.directory = directory
        self.directory.mkdir(exist_ok=True, parents=True)
        self.lock = threading.Lock()

    def path(self, repo, number):
        validate_repo(repo)
        return self.directory / f'{repo.replace("/", "_")}_{number}.json'

    def read(self, repo, number):
        try:
            return json.loads(self.path(repo, number).read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def save(self, repo, number, snapshot):
        path = self.path(repo, number)
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(path)

    def refresh(self, repo, number, loader=load_map):
        with self.lock:
            value = loader(repo, number)
            self.save(repo, number, value)
            return value


def export_html(snapshot):
    html = (WEB / 'index.html').read_text()
    css = (WEB / 'styles.css').read_text()
    script = (WEB / 'app.js').read_text()
    data = json.dumps(snapshot, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    html = html.replace('<link rel="stylesheet" href="/styles.css">', f'<style>{css}</style>')
    return html.replace('<script src="/app.js" defer></script>',
                        f'<script>window.WAYFINDER_SNAPSHOT={data};</script><script type="module">{script}</script>')


def make_handler(store, defaults):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # API responses can contain private issue content; never log bodies.
            pass

        def send(self, status, body, content_type='application/json; charset=utf-8', attachment=False):
            if isinstance(body, (dict, list)):
                body = json.dumps(body, ensure_ascii=False)
            if isinstance(body, str):
                body = body.encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('X-Frame-Options', 'DENY')
            if attachment:
                self.send_header('Content-Disposition', 'attachment; filename="wayfinder-map.html"')
            self.end_headers()
            self.wfile.write(body)

        def allowed_host(self):
            port = self.server.server_port
            return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')

        def do_GET(self):
            if not self.allowed_host():
                return self.send(403, {'error': '仅允许本机访问。'})
            url = urlparse(self.path)
            query = parse_qs(url.query)
            try:
                if url.path == '/api/config':
                    return self.send(200, defaults)
                if url.path in ('/api/map', '/api/export'):
                    repo, number = parse_target(query)
                    value = store.read(repo, number)
                    if not value:
                        return self.send(404, {'error': '还没有这张地图的本地快照，请点击刷新地图。'})
                    if url.path == '/api/export':
                        return self.send(200, export_html(value), 'text/html; charset=utf-8', attachment=True)
                    return self.send(200, value)
                if url.path == '/api/maps':
                    repo = validate_repo(query.get('repo', [defaults['repo']])[0])
                    return self.send(200, list_maps(repo))
                files = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
                         '/app.js': ('app.js', 'text/javascript'), '/styles.css': ('styles.css', 'text/css')}
                if url.path in files:
                    name, kind = files[url.path]
                    return self.send(200, (WEB / name).read_bytes(), kind + '; charset=utf-8')
                if url.path == '/favicon.ico':
                    return self.send(204, b'', 'image/x-icon')
                self.send(404, {'error': '页面不存在。'})
            except ValueError as exc:
                self.send(400, {'error': str(exc)})
            except GithubError as exc:
                self.send(502, {'error': str(exc)})
            except Exception:
                self.send(500, {'error': '本地读取失败，请重试或重新启动查看器。'})

        def do_POST(self):
            port = self.server.server_port
            if not self.allowed_host() or self.headers.get('Origin') not in (f'http://127.0.0.1:{port}', f'http://localhost:{port}'):
                return self.send(403, {'error': '仅允许查看器页面发起刷新。'})
            if self.path != '/api/refresh':
                return self.send(404, {'error': '接口不存在。'})
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 4096:
                    raise ValueError('刷新请求无效。')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('刷新请求无效。')
                repo, number = parse_target({key: [str(payload[key])] for key in ('repo', 'number') if key in payload})
                self.send(200, store.refresh(repo, number))
            except (ValueError, TypeError, KeyError) as exc:
                self.send(400, {'error': str(exc)})
            except GithubError as exc:
                self.send(502, {'error': str(exc) + ' 已保留上次快照。'})
            except Exception:
                self.send(500, {'error': '刷新未完成，已保留上次快照。'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description='Wayfinder 本地地图查看器')
    parser.add_argument('--repo', default='', help='GitHub repository in owner/repo format; omit to choose in the browser')
    parser.add_argument('--map', type=int, default=1, dest='number')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--export', type=Path, help='将已有缓存导出成可直接打开的 HTML，然后退出')
    args = parser.parse_args()
    repo, number = args.repo, args.number
    if repo or args.export:
        try:
            repo, number = parse_target({'repo': [repo], 'number': [str(number)]})
        except ValueError as exc:
            parser.error(str(exc))
    elif number < 1:
        parser.error('地图议题编号必须为正整数。')
    store = SnapshotStore(ROOT / '.cache')
    if args.export:
        value = store.read(repo, number)
        if not value:
            parser.error('请先运行查看器并刷新地图，再导出。')
        args.export.write_text(export_html(value), encoding='utf-8')
        print(args.export.resolve())
        return
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(store, {'repo': repo, 'number': number}))
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'Wayfinder 已启动：{url}  （按 Ctrl+C 停止）', flush=True)
    if not args.no_browser:
        threading.Timer(.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n查看器已停止。')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
