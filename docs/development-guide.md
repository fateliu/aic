# 从零看懂并开发漫想工坊

## 1. 这是什么项目

这是一个本机运行的 Web 应用。浏览器显示界面；Node.js 后端管理项目，调用文本/图像模型，把结果保存到硬盘。当前没有 React、Vue、数据库服务器或复杂构建工具，运行时也没有第三方 npm 依赖。

先理解这一条链：

```text
页面按钮 → public/app.js 或 images.js → fetch('/api/...')
  → server.mjs 校验、加锁、读取项目
  → lib/studio.mjs 或 images.mjs 执行业务
  → 模型服务 / 本机规则演示
  → lib/store.mjs 保存 JSON，图片模块保存 PNG
  → 浏览器更新当前项目
```

主子 Agent 使用同一后端中的不同模型上下文；“子 Agent”不是另一个要单独安装的程序。Skill 是一份受限的创作指令 Markdown，也不是自动执行的插件。

## 2. 第一次运行

安装 Node.js 22+ 和 Git。克隆仓库，在仓库目录运行：

```powershell
git clone https://github.com/fateliu/aic.git
cd aic
node --version
npm run dev:mock
```

打开 `http://127.0.0.1:3100`，用规则演示完成一次创作。练习服务不读取 `.env`，禁用真实文本提供方，图片使用仓库中的示例素材，不产生模型调用费用。练习数据写入 `data-mock/`。

需要真实服务时，停止练习或另开终端运行 `npm start`，打开 3000 端口。复制 `.env.example` 为 `.env`，按 README 填密钥；已有 `.env` 不要覆盖。每个人使用自己的本机配置，密钥不要粘到群聊、GitHub 或截图中。

修改 HTML / CSS / 前端 JS 后刷新浏览器；修改服务端 `.mjs`、`.env` 后重启对应服务。修改 Skill 后新项目会读取新内容，旧项目仍保留原来的快照。按 `Ctrl+C` 停止终端中的服务。

## 3. 文件夹地图

```text
aic/
├─ public/                 浏览器能访问的页面、脚本、样式和图片
│  └─ assets/              红蓝角色图片、可替换的背景素材
├─ lib/                    服务端业务逻辑
├─ creative-skills/        创作方法指令包及注册表
├─ scripts/                开发辅助入口，例如无密钥练习服务
├─ test/                   不计费的自动化测试
├─ docs/                   产品、开发、分工、接口、比赛说明
│  ├─ examples/            可公开的实际生成样例与精简记录
│  └─ qa/                  队友可直接填写的测试、素材、反馈模板
├─ .github/workflows/      GitHub 自动运行测试的配置
├─ data/                   真实工作台的私有项目与图片（不提交）
├─ data-mock/              练习项目与图片（不提交）
├─ server.mjs              HTTP 服务入口
├─ package.json            版本、Node 要求、启动/测试命令
├─ start.cmd               Windows 双击启动入口
├─ .env.example            配置模板，只有示例，没有真实密钥
├─ .env                    个人密钥与配置（不提交）
└─ .gitignore              排除本地配置、数据、日志等
```

`data/`、`data-mock/` 运行后才可能出现。仓库外的原组内讨论文稿是需求参考，不参与程序运行。开发者机器上的临时截图和 QA 工具不属于产品源码。

## 4. 核心文件逐个说明

| 文件 | 作用 | 通常什么时候修改 |
| --- | --- | --- |
| `server.mjs` | 路由、JSON 校验、单进程项目锁、静态资源、错误响应 | 增加 API、接入任务调度、改变部署方式 |
| `lib/studio.mjs` | 新版 brief/提示词/草稿校验，主子 Agent 编排与规则演示，TXT 导出 | 调整创作类型、提示词、工具流程 |
| `lib/providers.mjs` | DeepSeek / Ollama 文本协议，JSON 和工具消息适配 | 接新文本模型、修改供应商协议 |
| `lib/images.mjs` | 百炼适配、单张提交去重、轮询、下载、恢复、角色参考 | 接新图片服务、排查生图问题 |
| `lib/image-provider.d.ts` | 图片适配器的方法与返回值约定，供编辑器阅读 | 前后端协商扩展提供方能力 |
| `lib/store.mjs` | 项目 JSON 的保存、读取、列表、原子替换 | 存储迁移、备份、数据读写问题 |
| `lib/skills.mjs` | Skill 白名单、类型过滤、内容快照与 SHA256 | 扩展指令包加载规则 |
| `lib/agent.mjs` | 旧版校园活动生成与 SVG 导出 | 修复旧项目兼容问题；新功能优先放 studio |
| `public/index.html` | 页面结构、表单、结果区、主题按钮和角色展示 | 增加或调整界面区域 |
| `public/style.css` | 红蓝变量、斜切构图、角色裁切、表单与手机适配 | 改视觉风格和响应式布局 |
| `public/app.js` | 表单事件、项目状态、确认、历史、阶段跳转、背景 | 调整前端业务交互 |
| `public/images.js` | 图片提交、状态轮询、预览、参考选择、Canvas 四格合成 | 改媒体操作与下载体验 |
| `public/appearance.js` | 红蓝配色、偏好保存、受控随机装饰、主视觉配置 | 调整主题行为，不涉及模型调用 |
| `public/theme.json` | 默认主题、两张主视觉和背景配置 | 换图片或改默认配色，无需改业务逻辑 |
| `public/assets/hero-sky.png` / `hero-flare.png` | 用户提供的角色皮肤图片 | 更换角色主视觉，登记来源 |
| `creative-skills/registry.json` | 指令包 ID、类型、路径、来源、是否启用 | 注册新的 Skill |
| 三个 `creative-skills/*/SKILL.md` | 漫画连续性、镜头设计、画面构图方法 | 调整创作指导内容 |
| `creative-skills/SOURCES.md` / `comic-continuity/LICENSE` | 上游来源、扩展方法与许可 | 新增/更新来源与授权说明 |
| `scripts/dev-mock.mjs` | 用本机图片夹具模拟完整流程，单独 3100 端口 | 队友无密钥开发和人工测试 |
| `test/agent.test.mjs` | 旧版活动流程测试 | 改旧版流程时 |
| `test/studio.test.mjs` | 主子 Agent、Skill、确认/版本与 HTTP 测试 | 改文本编排和新版状态时 |
| `test/images.test.mjs` | 图片协议、去重、恢复、参考图、下载与锁 | 改图片服务时 |
| `.github/workflows/test.yml` | 在 Windows / Ubuntu 与 Node 22 / 24 上跑测试 | 改支持环境或 CI |

`.mjs` 是使用 ES Modules 的 JavaScript；`.d.ts` 是类型说明，当前不需要 TypeScript 编译步骤；`.md` 是 Markdown 文档；`.json` 是结构化配置/数据。

## 5. 怎么开始改一项功能

以“新增一个创作 Skill”为例：复制相近指令包目录，修改 Markdown，使用新 ID 注册到 registry，刷新页面，新建项目验证可选择且类型正确；检查项目 Skill 快照是否包含新内容。不要通过扩展指令包执行系统脚本。

以“接新图片模型”为例：先读后端接口文档，实现 ImageProvider 的 submit/query/download，再注入 createApp。维持图片任务状态、revision、confirmCost 和 replaces 语义。不要把供应商密钥直接交给浏览器。

以“修改界面”为例：结构看 index.html，配色和断点看 style.css，纯主题状态看 appearance.js，业务按钮看 app.js / images.js。HTML 中现有 id 被脚本使用，改名时要同步所有引用。别只在桌面看效果；至少检查 390px 和 1440px。

## 6. 提交代码和协作

每人先建立自己的分支：

```powershell
git pull --ff-only
git switch -c feat/your-task-name
npm test
git status
# 只添加本次修改的文件，例如：
git add docs/qa/manual-checklist.md
git commit -m "docs: record first manual test run"
git push -u origin feat/your-task-name
```

到 GitHub 创建 Pull Request，说明“解决什么问题、实际做了什么、如何验证”。分支名应换成自己的任务名，后续更新使用 `git push`。默认由项目负责人检查后合并，避免三个人同时直接改 main。

同一时间尽量分开编辑：负责人以 public 为主，后端同学以 lib/server/test 为主，测试同学以 docs/qa 为主。需要双方修改接口时先在 PR 中写清请求与响应，再改代码。

提交前运行 `npm test`。样式修改还要看浏览器；模型协议修改先用模拟提供方验证，真实调用由负责人控制次数。提交列表中不应出现 `.env`、data、data-mock 或未脱敏的用户记录。

## 7. 常见问题

- **端口被占用**：先关掉自己启动的旧服务；真实入口可改 PORT 并重启，练习入口固定 3100。不要结束不认识的进程。
- **只有文字，没有图片**：真实图片需要单独的百炼 Key；DeepSeek 只负责规划与文字。
- **练习生成四张相同图片**：这是夹具行为，只测试流程，不测试画面效果。
- **改完 CSS 看不到变化**：刷新或硬刷新；确认打开的是正确端口。
- **修改后按钮不能点**：先保存修改，重新检查并确认当前版本，再执行后续动作。
- **导出 JSON 后图片没一起带走**：JSON 不嵌入 PNG，备份要复制完整 data 目录。

具体任务与验收见 [团队分工](team-plan.md)，接口请求体见 [后端交接](backend-handoff.md)。
