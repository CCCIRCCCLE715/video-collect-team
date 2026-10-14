#!/usr/bin/env python3
"""Build an allowlisted, data-free release and an editor-friendly Edge Function."""
import json
import base64
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
PUBLIC_FILES = ['index.html', 'team-config.js', 'README.md', 'LICENSE', 'AGENTS.md', 'package.json', '.gitignore', '.agent.env.example',
    'assets/topic.js', 'assets/team-client.js', 'assets/team-ui.js', 'assets/team.css',
    'scripts/build_local.py', 'scripts/build_release.py', 'scripts/team_import.py',
    'tests/library.cjs', 'tests/team.test.mjs', 'tests/database.test.mjs', 'tests/test_import.py', 'tests/browser_fixture.py',
    'supabase/config.toml', 'supabase/migrations/202610130001_team.sql',
    'supabase/functions/agent-import/handler.js', 'supabase/functions/agent-import/index.ts', 'docs/SETUP.md', 'docs/AGENT.md']

def main():
    page = (ROOT / 'index.html').read_text()
    data = re.search(r'<script id="catalog" type="application/json">(.*?)</script>', page, re.S)
    if not data or json.loads(data[1]) != []:
        raise ValueError('公开模板必须为空，不能打包私人选题。')
    config = (ROOT / 'team-config.js').read_text()
    if 'sb_secret_' in config:
        raise ValueError('不能打包 secret key。')
    for jwt in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', config):
        payload = jwt.split('.')[1]
        try: role=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4))).get('role')
        except (ValueError, TypeError): role=None
        if role!='anon': raise ValueError('只能打包 publishable / anon key。')
    DEST.mkdir(exist_ok=True)
    source = DEST / 'project'
    if source.exists(): shutil.rmtree(source)
    source.mkdir()
    for filename in PUBLIC_FILES:
        (source / filename).parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT / filename, source / filename)
    topic = (ROOT / 'assets/topic.js').read_text().replace('export ', '')
    handler = re.sub(r'^import .*?;\n', '', (ROOT / 'supabase/functions/agent-import/handler.js').read_text()).replace('export ', '')
    runtime = re.sub(r'^import .*?;\n', '', (ROOT / 'supabase/functions/agent-import/index.ts').read_text())
    bundle = topic + '\n' + handler + '\n' + runtime
    (DEST / 'agent-import.bundle.ts').write_text(bundle)
    (source / 'docs/agent-import.bundle.ts').write_text(bundle)
    web = DEST / 'web'
    if web.exists(): shutil.rmtree(web)
    web.mkdir()
    for filename in ['index.html', 'team-config.js']:
        shutil.copy2(source / filename, web / filename)
    for folder in ['assets', 'docs']:
        shutil.copytree(source / folder, web / folder)
    with zipfile.ZipFile(DEST / 'video-collect-team.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob('*')):
            if path.is_file(): archive.write(path, Path('video-collect-team') / path.relative_to(source))
    print('Built dist/video-collect-team.zip, dist/web/ and dist/agent-import.bundle.ts; no private catalog or covers included.')

if __name__ == '__main__': main()
