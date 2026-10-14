# 开通四人共享网站

管理员完成一次配置后，四位成员使用同一个网站。项目里不含真实选题，现有本地数据可以在网站连接成功后迁移。

## 1. 创建免费项目

打开 [Supabase 控制台](https://supabase.com/dashboard)，创建组织和 **Free** 项目，选择离团队较近的可用地区。设置数据库密码并自行保存，密码不用发给 Agent 或同事。

在项目的 **SQL Editor** 新建查询，粘贴并运行仓库中的 `supabase/migrations/202610130001_team.sql`。这个脚本创建成员表、选题表、入库凭证和私有封面桶。适用于新项目，运行一次即可。

## 2. 添加四位成员

还没确定成员时，可以先在 `team-config.js` 的 `pendingMemberNames` 中填写四个占位姓名。网页会显示这些预留名称，数据库不会创建虚拟登录账号，也不会因此开放选题访问。确定成员后，按下面的步骤创建账号并绑定 UID；占位姓名可以从配置中移除。

进入 **Authentication → Users → Add user / Create user**，创建四个邮箱账号，设置各自密码并确认邮箱。在 Authentication 的登录设置中关闭公开注册。成员首次登录后可由管理员协助更改临时密码。

复制四个账号的 User UID，在 SQL Editor 运行下列语句。把示例 UID 和姓名替换为实际值：

```sql
insert into public.team_members(user_id,name) values
('11111111-1111-1111-1111-111111111111','成员一'),
('22222222-2222-2222-2222-222222222222','成员二'),
('33333333-3333-3333-3333-333333333333','成员三'),
('44444444-4444-4444-4444-444444444444','成员四');
```

成员上限由数据库限制为四人。换人时，管理员在成员表删除旧 UID，再添加新 UID；被移除者的入库凭证同时失效，已有选题保留。

## 3. 部署 Agent 入库函数

运行 `python3 scripts/build_release.py`，得到 `dist/agent-import.bundle.ts`。在 Supabase 的 **Edge Functions → Deploy a new function → Via Editor** 中，新建名称为 **agent-import** 的函数，将生成文件的全部内容粘贴到 `index.ts`，部署。

在函数的配置中关闭 **Verify JWT / Enforce JWT Verification**。这个函数使用成员自己的 `X-Agent-Token`，会在写入前到数据库验证凭证；空凭证、错误凭证和已撤销凭证均无法写入。关闭的是平台默认 JWT 检查，函数自身的成员验证会保留。管理员密钥由 Supabase 的函数环境提供，网页与成员脚本不持有它。

如果习惯命令行，也可安装 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)，在仓库根目录执行：

```bash
npx supabase login
npx supabase functions deploy agent-import --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF` 是项目地址 `https://YOUR_PROJECT_REF.supabase.co` 中的这一段。函数配置已写在 `supabase/config.toml`。

## 4. 配置与发布网站

在 Supabase 的 **Connect / Project Settings → API Keys** 找到项目 URL 与 **publishable key**（老项目也可使用 **anon public key**），填入 `team-config.js`：

```js
window.VIDEO_COLLECT_TEAM = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY',
  teamName: '团队选题库',
  pollSeconds: 5
};
```

不要填 secret、service_role、数据库密码或成员入库凭证。项目地址与 publishable / anon key 是公开连接配置，数据访问由成员登录和数据库规则控制。

将公开项目代码上传到 GitHub。在仓库 **Settings → Pages** 中，选择从分支发布，目录选择根目录 `/`。部署成功后，GitHub 会显示实际网站地址，通常是 `https://你的用户名.github.io/仓库名/`。把这个地址发给四位成员。静态网站只包含界面，选题和封面留在 Supabase 私有存储中。

本地预览也可在项目根目录运行 `python3 -m http.server 8798 --bind 127.0.0.1`，打开 [Open local site](http://127.0.0.1:8798/)。仅打开 HTML 文件无法完整使用模块脚本，请通过 HTTP 访问。

## 上线检查与现有资料迁移

用两位成员分别登录不同浏览器。在第一个浏览器新增一条示例选题并上传封面；另一个浏览器在前台等待约 5 秒，检查标题、平台、成员署名和封面。删除、恢复、替换封面也要各操作一次。用未加入成员表的账号登录，应提示尚未加入团队。

为自己的账号生成入库凭证，按 [Agent 接入说明](AGENT.md) 配置本机 `.agent.env`，再运行 `python3 scripts/team_import.py site/catalog.json`，把已有本地资料迁移到团队库。迁移成功前保留本地副本。

## 免费方案的维护

存储增长主要来自封面。每张约 100 KB 时，1,000 张约占 100 MB；每张接近 2 MB 时，额度会消耗得更快。上传前可压缩原封面，网站不保存完整视频。删除会保留恢复所需的数据与图片，反复更换封面产生的旧图片需管理员定期检查存储，确认未被任何记录引用后清理。

Free 项目长期不活跃可能暂停，到控制台恢复即可。免费方案没有自动备份；团队应定期导出数据库，并备份 Storage 的封面文件。仅网页“导出筛选结果”适合分享选题，不是包含全部文案与图片的完整备份。

费用以 [Supabase 当前价格](https://supabase.com/pricing) 为准。项目不会自动切到付费套餐；准备升级时由管理员检查用量、价格并决定。

## 启用成员周表

已有共享版项目，按顺序执行 `supabase/migrations/20261014144342_member_weekly_tables.sql` 和 `supabase/migrations/20261014144452_weekly_tables_cron.sql`。新项目要先执行原来的 `202610130001_team.sql`。已有记录会进入各自成员的周表，原始数据和封面继续保留。

任务 `video-collect-weekly-tables` 每周二 16:00 UTC 执行，对应北京时间周三 00:00。可在 Supabase 的 Cron 页面查看运行记录。部署后检查 `library_weeks` 和 `member_week_tables`：每期应有四份成员表。成员加入后首次访问也会补齐其表格。

### 成员身份与保持登录

邮箱账号与 `team_members.user_id` 绑定，姓名由管理员设置，每个姓名只能绑定一个账号。页面从服务器读取当前登录账号的姓名和邮箱；点击其他人的分栏只会切换浏览内容，新增选题仍归入自己的本周表。Agent 也按个人入库凭证确定归属。更换成员时，先核对账号 UID，再修改成员绑定。

同一浏览器会保存登录状态，关闭页面后再次打开会自动恢复。断网或服务暂时不可用时会保留登录并重试，点击“退出”才会主动清除。清除浏览器网站数据、账号被撤销或密码重置后，可能需要重新登录。网站不设置安全问题。
