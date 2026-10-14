# 四人共享选题库

[Open deployed site](https://cccircccle715.github.io/video-collect-team/)

把抖音、小红书、Instagram 等平台的视频选题放到同一个网站。四位成员各自登录，上传的信息和封面进入同一份资料库；网站在前台每 5 秒检查更新，切回页面时也会刷新。检查时只读取版本号，内容变化后才下载列表，减少重复传输。

页面保留封面缩略图、放大预览、月份和平台分类、搜索、排序及导出。标题/文案和一句话总结最多显示三行，超出部分在栏内向下滚动。每条选题显示收录成员，删除和恢复对整个团队生效。

## 开通共享网站

网站由两部分组成：GitHub Pages 托管静态页面，Supabase 保存账号、选题和私有封面。运行时不需要购买独立服务器，也不需要 OpenAI API 密钥。Supabase 需要管理员开通项目后才能连接；仓库默认不附带账号或选题。

[按开通步骤部署](docs/SETUP.md)。管理员只需配置一次，成员使用同一个网址。

按当前 [Supabase 定价](https://supabase.com/pricing)，Free 方案包含 500 MB 数据库、1 GB 文件存储和 5 GB 出站流量。四人保存文字与压缩封面可从免费额度开始使用，实际容量取决于图片大小、记录数量和访问频率。免费项目连续一周不活跃可能暂停，暂停后要在控制台恢复；免费方案不提供自动备份。Pro 当前从每月 25 美元起，项目不会替你自动升级。

网站保存原帖信息和真实封面，视频播放会打开原平台。平台要求登录时，采集由成员自己的浏览器完成。账号登录态不会上传到团队网站。

## 让 Agent 自动收录链接

下载这个仓库，在项目聊天中把视频链接发给 Agent。仓库的 [AGENTS.md](AGENTS.md) 规定了读取、去重、总结和入库方式。成员在网站登录后打开“Agent 入库”，生成自己的入库凭证，保存在本机 `.agent.env`；Agent 随后通过附带脚本上传信息和封面。

[成员接入与入库示例](docs/AGENT.md)。个人凭证可以新增选题和封面，不能读取资料库或删除记录；重置或撤销会立即停用旧凭证。管理员密钥不会发给成员。

网页也可以点击“新增选题”手动填写信息、上传真实封面。仅填写链接时显示“信息待补”；网站不会编造标题、作者、日期或图片。自动读取需要能操作成员浏览器的 Agent，在这个项目里收到链接后执行，不会跨聊天或无消息时自行抓取。

## 保留本地选题库

把私有选题数组放在 `site/catalog.json`，封面放在它附近的目录并使用相对路径，然后运行：

```bash
python3 scripts/build_local.py
python3 -m http.server 8798 --bind 127.0.0.1
```

[Open local site](http://127.0.0.1:8798/site/)。未放入私有数据时，跳过本地构建，直接预览项目根页面。团队配置不影响这个本地副本。

迁移现有选题时，在本机完成个人凭证配置后运行：

```bash
python3 scripts/team_import.py site/catalog.json --dry-run
python3 scripts/team_import.py site/catalog.json
```

第一条命令检查文件，不上传；第二条把资料和封面加入私有团队库。重复运行会合并同一原帖，已有标题、文案和封面不会被空字段覆盖。已删除的记录会保持删除状态，需在网站中恢复。

## 检查与打包

网站运行没有前端依赖。开发检查需要 Node.js 22 以上和 Python 3.9 以上：

```bash
npm install
npm test
python3 scripts/build_release.py
```

数据库测试使用 PGlite 在本机执行 PostgreSQL，验证成员限制、RLS 权限、去重、删除恢复和凭证撤销。Auth 与 Storage 的平台接口在测试中用夹具代替；正式上线后仍须按部署说明做两位成员的实际联机检查。

不安装数据库测试依赖时，可分项检查：

```bash
node --test tests/team.test.mjs
node tests/library.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

打包生成 `dist/video-collect-team.zip` 和 `dist/web/`。ZIP 用于分享完整项目，`web/` 用于静态托管。打包使用文件名单，排除本机 `site/`、`data/`、凭证、浏览器缓存和依赖目录。`team-config.js` 只放项目地址与 publishable / anon key，这两项可以公开；任何 secret / service_role key 都不能写入网页。

## 来源

基于 [huangbai-AI/video-collect-website](https://github.com/huangbai-AI/video-collect-website) 修改，沿用 MIT 许可证。
