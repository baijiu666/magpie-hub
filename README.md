# magpie hub

把几位作者的**公开 magpie 插件**收进一个静态页面：带插件原图标与作者头像、可搜索、可筛选、一键复制安装命令，直接托管在 GitHub Pages。

当前快照：GitHub `MYCF711`、Gitee `Ghandi`、GitHub `3294798852` 三个来源，收录 28 个插件（页面默认隐藏模板仓、旧注册表和网关仓，实际展示 25 个）。

界面用 [shadcn/ui](https://github.com/shadcn-ui/ui) 的组件（Button / Card / Badge / Input / Dialog / Select / Switch / Tooltip / Sonner）搭，样式走 Tailwind CSS v4；筛选 chip 这类小组件是原生按钮 + Tailwind。

## 本地开发

```bash
npm install
npm run data     # 拉一次 GitHub，生成 public/data/plugins.json 和插件图标
npm run dev      # http://localhost:5173
```

换作者、加作者或想更新版本号时，改 `config.json` 的 `sources` 后重跑 `npm run data`。

## 构建

```bash
npm run build    # 产物在 dist/，纯静态，可直接丢到任何静态托管
npm run preview  # 本地预览产物
```

## 发布到 GitHub Pages

仓库里已经放好 `.github/workflows/pages.yml`：

1. 新建公开仓库，把本目录推上去（`git init` / `commit` / `remote add` / `push`）。

2. GitHub → 仓库 **Settings → Pages** → Source 选 **GitHub Actions**。

3. 之后每次 push 自动构建发布，地址是 `https://<你的账号>.github.io/magpie-hub/`。

如果这台机器连不上 `github.com:443`（只有 `api.github.com` 通），`git push` 会失败，用 `node scripts/push.mjs` 走 API 推送：它把 **git 已跟踪的文件**打成一次提交（未 `git add` 的改动不会被带上），父提交取远端 HEAD，内容没变会自动跳过。

不想用 Actions 的话，把 `dist/` 提交到 `gh-pages` 分支并在 Pages 里选该分支也可以（`vite.config.ts` 里 `base: "./"`，子路径部署不会丢资源）。

## 配置

`config.json`：

| 字段 | 作用 |
|---|---|
| `sources` | 作者来源列表（GitHub / Gitee 可混排，`{provider, owner}`） |
| `title` | 站点名（顶栏） |
| `exclude` | 不展示的仓库（模板、归档、非插件） |
| `include` | 强制展示不在 `magpie-*` 命名下的仓库 |
| `liveOnLoad` | 打开页面时是否用 GitHub API 实时同步一次 |
| `gateSeconds` | 开屏公告的倒计时秒数 |

页面右上角「设置」能增删作者（GitHub 作者实时生效，Gitee 作者需要在 `config.json` 里加完重跑构建）、开关自动同步、清除本地数据。

## 安装

每张卡片都给出安装命令（GitHub 是 `magpie plugin add github:<owner>/<repo>`，Gitee 是 `git+https://gitee.com/<owner>/<repo>`），点「复制」粘到终端即可，永远对应仓库最新代码。

每张卡右侧的窗口按钮：插件在 npm 上、当前是电脑、且检测到本机 magpie（默认网关 3425）时，打开 `magpie://plugin?name=<包名>`；它只会跳到 magpie 的插件面板，**不会自动安装**，还得在面板里按 Install。其余情况（手机 / 没发布 npm / 没检测到 magpie）点了就是复制命令。

## 说明

- 只收录**公开**仓库；私有仓匿名接口读不到，页面里也不会出现。
- 插件图标取自仓库里的 `registry-entry.json` / `package.json`（`magpie.icon`），构建时缩到 96px PNG 存进 `public/data/icons/`，一张约 10KB；没有图标的用首字母渐变徽标兜底。
- 实时同步走匿名 GitHub API：每 IP 每小时 60 次，超了页面提示并继续用快照。
- 响应式：手机单列、平板两列、桌面三列（320–1920 实测无横向溢出）；主要字号用 rem，个别极小字（徽标、脚注）用固定 px。
- 作者头像（含 magpie 作者 yetone）在构建时下载到 `public/data/authors/`，页脚按 GitHub / Gitee 分组显示。
- 工具栏三行：搜索 + 排序、状态筛选、作者筛选（都能横向滑动）；页面向下滚动后收紧成一条，点开恢复。
- 动画用 [motion](https://github.com/motiondivision/motion)：公告入场、工具栏收起、回到顶部/到底部的缓动滚动。
- `.github/workflows/refresh.yml` 每 6 小时重建一次快照并提交，Gitee 作者的数据靠它自动更新（Gitee API 没有 CORS，浏览器端拉不了）。
- 开屏使用公告 10 秒倒计时，`?gate=1` 强制显示、`?gate=0` 跳过。手机端没有 magpie（iOS 无客户端），安装按钮退回复制命令。
