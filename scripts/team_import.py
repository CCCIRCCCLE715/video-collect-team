#!/usr/bin/env python3
"""Import verified metadata + original covers, using a member's write-only token."""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 2 * 1024 * 1024

def load_settings(path):
    settings = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            key, sep, value = line.partition('=')
            if sep and key.strip().startswith('VIDEO_COLLECT_'):
                settings[key.strip()] = value.strip().strip('"\'')
    for key in ('VIDEO_COLLECT_SUPABASE_URL', 'VIDEO_COLLECT_AGENT_TOKEN'):
        if key in os.environ:
            settings[key] = os.environ[key]
    url = settings.get('VIDEO_COLLECT_SUPABASE_URL', '').rstrip('/')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path or 'YOUR_PROJECT' in url:
        raise ValueError('请在本机 .agent.env 填写 Supabase HTTPS 项目地址。')
    token = settings.get('VIDEO_COLLECT_AGENT_TOKEN', '')
    if not re.fullmatch(r'[a-f0-9]{64}', token):
        raise ValueError('请填写网站“Agent 入库”生成的个人凭证。')
    return url, token

def read_cover(path):
    data = path.read_bytes()
    mime = mimetypes.guess_type(path.name)[0]
    if len(data) > LIMIT or mime not in ('image/jpeg', 'image/png', 'image/webp'):
        raise ValueError('封面必须是小于 2 MB 的 JPG、PNG 或 WebP 图片：' + path.name)
    return {'mime': mime, 'base64': base64.b64encode(data).decode('ascii')}

def make_payload(row, base, explicit_cover=None):
    if not isinstance(row, dict) or not row.get('url'):
        raise ValueError('每条选题需要原帖 url。')
    # No cookies, credentials, local paths, ownership fields or cached signed URLs.
    fields = ('url', 'title', 'author', 'description', 'summary', 'summary_basis', 'published_at', 'month', 'likes', 'likes_label', 'duration', 'comments', 'views')
    payload = {'topic': {k: row[k] for k in fields if k in row}}
    poster = explicit_cover or row.get('poster')
    if poster:
        if urlparse(str(poster)).scheme:
            raise ValueError('请由 Agent 保存原帖真实封面为本地文件，再填写相对路径。')
        candidate = (base / str(poster)).resolve()
        if explicit_cover is None and not candidate.is_relative_to(base.resolve()):
            raise ValueError('封面路径超出了选题 JSON 所在目录。')
        payload['cover'] = read_cover(candidate)
    return payload

def send(url, token, payload, opener=urlopen):
    req = Request(url + '/functions/v1/agent-import',
                  data=json.dumps(payload, ensure_ascii=False).encode(),
                  headers={'Content-Type': 'application/json', 'X-Agent-Token': token}, method='POST')
    try:
        with opener(req, timeout=45) as response:
            result = json.loads(response.read(65536))
            if not result.get('ok') or not result.get('id'):
                raise ValueError('服务未确认入库成功。')
            return result
    except HTTPError as exc:
        # Do not print request headers, token, full payload or signed links.
        raise ValueError(f'入库失败（HTTP {exc.code}）。检查凭证、函数部署和存储容量后重试。') from None
    except (URLError, TimeoutError):
        raise ValueError('无法连接入库服务。原文件已保留，可以重新运行。') from None

def main():
    parser = argparse.ArgumentParser(description='将已核验的视频信息和封面加入团队选题库。')
    parser.add_argument('json_file', type=Path, help='单条 JSON 或选题数组；相对封面路径基于这个文件的目录')
    parser.add_argument('--cover', type=Path, help='单条记录的本地原帖封面')
    parser.add_argument('--env-file', type=Path, default=ROOT / '.agent.env')
    parser.add_argument('--dry-run', action='store_true', help='离线检查文件，不读取凭证、不上传')
    args = parser.parse_args()
    raw = json.loads(args.json_file.read_text())
    rows = raw if isinstance(raw, list) else [raw]
    if args.cover and len(rows) != 1:
        raise ValueError('--cover 只适用于单条记录。')
    # Validate the entire batch before making any external writes.
    payloads = [make_payload(row, args.json_file.resolve().parent, args.cover.resolve() if args.cover else None) for row in rows]
    if args.dry_run:
        print(f'检查通过：{len(payloads)} 条，{sum("cover" in p for p in payloads)} 张封面；未上传。')
        return
    url, token = load_settings(args.env_file)
    done = 0
    try:
        for payload in payloads:
            result = send(url, token, payload)
            done += 1
            print(f'已入库 {done}/{len(payloads)}：{result["id"]}；封面：{"已保存" if result.get("cover_saved") else "未提供"}')
    except ValueError:
        print(f'已完成 {done}/{len(payloads)} 条；重新运行会按原帖 ID 合并。', file=sys.stderr)
        raise

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
