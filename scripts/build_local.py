#!/usr/bin/env python3
"""Render the public template with a private, local catalog; no network requests."""
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog_path = ROOT / 'site/catalog.json'
items = json.loads(catalog_path.read_text())
page = (ROOT / 'index.html').read_text()
page = re.sub(r'<script[^>]*data-team-only[^>]*></script>\s*', '', page)
catalog = json.dumps(items, ensure_ascii=False).replace('<', '\\u003c')
page = re.sub(r'(<script id="catalog" type="application/json">).*?(</script>)',
              lambda m: m[1] + catalog + m[2], page, count=1, flags=re.S)
covers = sum(bool(row.get('poster')) for row in items)
note = f'本地选题库共 {len(items)} 条，已保存 {covers} 张封面。点击封面可放大预览或上传图片；删除后可在“已删除”中恢复。封面上传和删除状态保存在当前浏览器。'
page = re.sub(r'(<p class="scope-note">).*?(</p>)', lambda m: m[1] + note + m[2], page, count=1)
report_path = ROOT / 'data/audit-2026-10-13/report.json'
if report_path.exists():
    report = json.loads(report_path.read_text())
    pending = report['pending_publication']
    links = ''.join(f'<li><a href="{escape(row["url"], quote=True)}" target="_blank" rel="noopener noreferrer">{escape(row["title"])}</a>：{escape(row["evidence"])}。</li>' for row in pending)
    audit_note = (f'<details class="library-notes"><summary>本次核查：检查 {report["positions_checked"]} 个位置，补入 {report["added"]} 条，{len(pending)} 条待核验</summary>'
                  '<p>已检查抖音和小红书各最近10条收藏、10条点赞，按封面筛选AI或影视内容，排除黄白。新收录内容的发布时间为2026年9月24日至10月13日。以下笔记只显示编辑日期，尚未纳入选题库：</p>'
                  f'<ul>{links}</ul></details>')
    page = re.sub(r'(<p class="scope-note">.*?</p>)', lambda m: m[1] + audit_note, page, count=1)
page = page.replace('公开界面版尚未添加选题。此版本不包含个人采集记录。', '没有符合当前筛选条件的选题。')
(ROOT / 'site/index.html').write_text(page)
print(f'Built local library: {len(items)} items, {covers} saved covers')
