# 成员的 Agent 接入

每位成员使用自己的登录账号和入库凭证。凭证只用于向团队库新增信息与封面，不提供读取、删除或管理员权限。


## 参考视频与选题（每次新增都要确认）

- 每条新记录必须明确 `entry_type`：`reference` 为参考视频，`topic` 为选题。
- 成员只发链接、没有说明类别时，询问“这是参考视频还是选题？”，提供这两个选项；保留已采集资料，收到选择后再入库。不要自行推断，也不要沿用上一条链接的类别。
- 成员已明确说“参考视频 / 参考案例”或“选题”时，跳过类别询问。参考视频直接入库。
- 选题必须填写 `topic_suggestion`：询问“这个视频适合做什么主题？描述一下准备怎么做。” 如果同条消息已给出明确制作建议，直接使用，不重复询问。缺少建议时不要代填、猜测或把原帖总结当作建议。
- 建议为 1–4000 字的中文描述；`summary` 仍概括原视频内容，`topic_suggestion` 说明成员自己的主题与做法，两者分别保存。
- 同一成员、同一周、同一分类按平台与原帖 ID 去重；参考区和选题区可各自保留同一个视频。不能通过重复导入把别的分类覆盖掉。
- 选题在网站“选题”区的对应成员周表中显示，链接下方展示“视频选题建议”；参考视频保存在“参考视频”区。历史记录默认归参考视频，可在网站“转为选题”后填写建议，原周表、封面、收藏和评论保留。

## 配置一次

1. 下载整个项目，在自己的 Agent 中打开这个项目目录，让它读取仓库 `AGENTS.md`。
2. 登录[团队网站](https://cccircccle715.github.io/video-collect-team/)，打开“Agent 入库”，点击“生成 / 重置入库凭证”。
3. 将 `.agent.env.example` 复制为 `.agent.env`，在本机填写项目 URL 和个人凭证。这个文件已加入 Git 忽略规则，不要把内容发到聊天或提交到仓库。

```dotenv
VIDEO_COLLECT_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VIDEO_COLLECT_AGENT_TOKEN=此处填写网站生成的64位个人凭证
```

## 收录视频链接

在项目聊天中把视频链接发给 Agent。它会在你的浏览器中读取原帖，保存可核验的信息和真实封面，写一句话总结，再调用 `scripts/team_import.py`。需要平台登录时，登录由你在浏览器完成，Cookie 不会上传。

支持 Instagram、抖音、小红书、哔哩哔哩、YouTube、TikTok 与 X 的完整原帖链接。短分享链接应在浏览器中打开，取跳转后的原帖地址。小红书需要的访问参数会保留，普通分享追踪参数会移除。

下面是提供给 Agent 的数据格式示例。示例没有真实视频资料：

```json
{
  "entry_type": "topic",
  "topic_suggestion": "做一期 AI 运镜教程，用同一场景演示提示词调整和成片对比。",
  "url": "https://www.instagram.com/reel/EXAMPLE123/",
  "title": "已核验的原帖标题",
  "author": "已核验的作者",
  "description": "已核验的完整文案",
  "summary": "用一句话概括已看到的视频内容。",
  "summary_basis": "依据原帖文案与已观看画面",
  "published_at": "2026-10-13",
  "likes": 100,
  "comments": 10,
  "poster": "covers/example.jpg"
}
```

保存为 `data/import/example.json`，原帖封面放在 `data/import/covers/example.jpg`。封面路径相对于 JSON 文件的目录。

```bash
python3 scripts/team_import.py data/import/example.json --dry-run
python3 scripts/team_import.py data/import/example.json
```

需要指定另一张本地原帖封面时：

```bash
python3 scripts/team_import.py data/import/example.json --cover data/import/covers/example.jpg
```

图片限制为 2 MB 以内的 JPG、PNG 或 WebP。批量入库可把多条记录放在 JSON 数组中。脚本会先检查整批封面文件，再逐条上传；中途失败会报告已完成数量，重新运行会按平台和原帖 ID 合并，不会重复新增。

原帖无法打开时，Agent 可以仅提交规范链接，网站显示“信息待补”；未知数据留空。后续读到原帖时更新同一链接，已保存的信息和封面不会被空字段覆盖。已经删除的记录保持删除状态，需在网站“已删除”中恢复。

入库凭证有泄露疑虑时，在网站点击“撤销凭证”或重新生成，然后更新本机 `.agent.env`。关闭凭证窗口后，网站不会再次显示旧凭证。

## 收录到成员周表

个人凭证决定收录成员，服务器以当前北京时间决定所属周表。每周三 00:00 开始新一周，至下周二结束。同一成员同一周、同一分类重复导入同一链接会合并；跨周或不同成员收录，会保存各自的记录。不要在 JSON 中指定别人的成员 ID 或所属周。

## 历史资料的月份

批量迁移本地库时，`month` 必须沿用本地原有月份（`YYYY-MM`），不要统一改为导入当月，也不要用视频发布时间推算。原月份会用于网站的默认月份导航；没有提供有效月份时，才采用北京时间的首次收录月份。真实导入时间和成员周表仍由服务器生成，无需伪造日期或重复导入历史资料。
