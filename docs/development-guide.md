# 从零看懂并开发漫想工坊

## 1. 当前技术结构

v0.6 前端使用 React + TypeScript + Vite + Tailwind CSS。Node.js 后端负责项目持久化、提示词子 Agent、主创 Agent 和万相 API。前后端仍通过同一组 JSON 接口通信，没有数据库服务器。

```text
React 组件 → useStudio / useImageJobs → src/lib/api.ts
  → /api/... → server.mjs → lib/业务模块 → 模型或本机模拟
  → 本地 JSON / 图片 → React 状态更新 → 页面
```

Agent 的职责与上下文在后端分离，子 Agent 不是单独安装的进程。Skill 是受限的创作指令 Markdown，不会自动执行第三方脚本。迁移过程和在线工具实例见 [React 迁移说明](react-migration.md)。

## 2. 第一次运行

安装 Node.js 22.12+（建议 24）、Git 和 Chrome。在自己的目录执行：

```powershell
git clone https://github.com/fateliu/aic.git
cd aic
npm ci
npm run dev:mock
```

打开 http://127.0.0.1:3100。先完成一次无密钥练习：示例 → 检查提示词 → 主创 → 确认草稿 → 逐格生成 → 下载。模拟服务不读取 .env，不调用付费模型，所有图像使用同一张夹具。

真实服务运行 npm start，页面为 http://127.0.0.1:3000。复制 .env.example 为 .env 后在本机填密钥，已有配置不要覆盖。npm start 会先构建 React 页面。Windows 的 start.cmd 首次可自动运行 npm ci，然后启动。

## 3. 开发模式与端口

| 用途 | 命令 | 打开的页面 |
| --- | --- | --- |
| 开发真实工作台，前端热更新 | npm run dev | http://127.0.0.1:5173 |
| 开发练习工作台，前端热更新 | npm run dev:mock:ui | http://127.0.0.1:5173 |
| 检查构建后的真实页面 | npm start | http://127.0.0.1:3000 |
| 检查构建后的练习页面 | npm run dev:mock | http://127.0.0.1:3100 |

dev 自动启动后端 3000；dev:mock:ui 自动启动后端 3100，再启动 Vite 5173。先停止自己已启动的同端口服务，避免冲突。Ctrl+C 结束开发脚本时会关闭它启动的两个子进程。真实与模拟模式不要同时占用 5173。

TSX、CSS 保存后自动更新页面。后端 .mjs、.env 修改后重启命令；public/theme.json 修改后刷新读取配置。Skill 修改只影响新项目，旧项目保存快照。修改 package.json 后同步 package-lock.json；队友拉取依赖变动后运行 npm ci。

## 4. 文件夹地图

```text
aic/
├─ src/                       React 前端源码（主要开发位置）
│  ├─ components/             页面功能组件
│  ├─ hooks/                  API 工作流、轮询、主题行为
│  ├─ state/                  编辑状态与响应合并规则
│  ├─ lib/                    请求、图片转换、漫画合成
│  └─ styles/                 Tailwind 入口、独特视觉样式
├─ public/                    静态素材与主题配置
│  └─ assets/                 红蓝角色图、背景图片
├─ lib/                       Node 服务端业务
├─ creative-skills/           创作 Skill 与来源许可
├─ scripts/                   开发启动和模拟服务
├─ test/                      Node 后端自动测试、JPEG 夹具
├─ tests/browser/             Playwright 浏览器与状态回归
├─ docs/                      开发、接口、分工、测试和比赛说明
├─ .github/workflows/         CI：安装、检查、构建、浏览器测试
├─ dist/                      自动构建结果，不提交、不手改
├─ data/、data-mock/          本机真实/模拟项目数据，不提交
├─ index.html                 Vite 页面入口
├─ vite.config.ts            React/Tailwind 插件、开发代理、输出目录
├─ tsconfig.json              TypeScript 严格检查设置
├─ playwright.config.ts       Chrome/CI Chromium 浏览器配置
├─ server.mjs                 后端入口，提供 API 与 dist 静态页面
├─ package.json               命令与依赖
├─ package-lock.json          精确依赖版本，必须提交
├─ start.cmd                  Windows 启动
└─ .env.example / .env        模板 / 私有密钥配置
```

不要直接修改 dist；下一次构建会覆盖它。不要把上传角色图、生成图和用户项目放进 src 或 public；产品的私有数据保存在 data 或 data-mock。

## 5. 核心文件怎么分工

| 文件 | 职责 |
| --- | --- |
| src/main.tsx | 挂载 React 根节点，加载样式，启用 StrictMode |
| src/App.tsx | 总体页面组合，创作类型与引擎选择 |
| src/components/Shell.tsx | 顶部、项目档案、主视觉、配色按钮、背景对话框 |
| src/components/Composer.tsx | 原始想法表单、示例、引擎与 Skill 选择 |
| src/components/ProjectEditor.tsx | 提示词折叠、分格编辑、人工确认、导出与执行记录 |
| src/components/ImagePanel.tsx | 单张生成、费用确认、任务卡片、恢复和四格下载 |
| src/components/ReferencePanel.tsx | 上传、预览和选择参考来源 |
| src/hooks/useStudio.ts | 项目创建/读取、阶段调用、保存/确认、忙碌与错误状态 |
| src/hooks/useImageJobs.ts | 自动查询、请求取消、失败暂停与手动恢复 |
| src/hooks/useAppearance.ts | 主题记忆、随机装饰、临时背景与 Object URL 清理 |
| src/state/project.ts | 保存状态与未保存编辑，拒绝其他项目/旧版本的轮询响应 |
| src/lib/api.ts | 带类型的 fetch、错误文案、Blob/JSON 下载 |
| src/lib/media.ts | 参考来源、JPEG 转换、Canvas 漫画合成 |
| src/types.ts | Project、Refinement、Creative、ImageJob、Reference 等前端接口类型 |
| src/styles/index.css | Tailwind 层与语义颜色入口 |
| src/styles/visual.css | 红蓝色板、人物裁切、斜切构图、动效和断点 |
| public/theme.json / assets | 可替换的默认主题配置与图片 |
| server.mjs | 路由、JSON 限制、同源/本机检查、项目锁、构建资源服务 |
| lib/studio.mjs | 新版输入校验、主子 Agent 编排、规则演示、TXT |
| lib/providers.mjs | DeepSeek / Ollama 文本协议 |
| lib/images.mjs / image-provider.d.ts | 万相适配、任务去重与恢复、提供方类型边界 |
| lib/references.mjs | 上传结构检查、去重、存储与同项目素材读取 |
| lib/store.mjs | 项目 JSON 原子保存、读取、列表 |
| lib/skills.mjs | Skill 白名单、类型、指令快照与哈希 |
| lib/agent.mjs | 旧版活动项目与 SVG 兼容 |
| scripts/dev.mjs / dev-mock.mjs | 双进程热更新启动 / 不计费模拟后端 |
| test/*.test.mjs | 后端协议、持久化、门禁、文件隔离、资源白名单 |
| tests/browser/studio.spec.ts | 用户操作回归与编辑状态合并测试 |

.ts 是 TypeScript；.tsx 是带 JSX 的 React 组件；.mjs 是后端 ES Modules；.d.ts 是类型声明。Vite 负责浏览器构建，tsc 负责类型检查，两者都在 npm run build 中执行。

## 6. 如何改功能

改界面：先找对应组件，用 props 传数据，用 onChange/onClick 改状态；不要在组件里重新写 querySelector(...).innerHTML、全局 onclick 或批量启用/禁用 DOM。焦点、dialog、Canvas 和浏览器下载可以通过 ref/浏览器 API 处理。

改样式：常规 flex/grid/gap/颜色/响应式用 Tailwind，独特角色构图继续写 visual.css。颜色优先用 text-studio-accent、bg-studio-paper 等语义工具类，以同时适配红蓝主题。不启用 Preflight 的原因和边框注意点见迁移文档。

改业务：看 useStudio 和 state/project。已保存项目与正在编辑的表单分开；刷新图片只合并媒体字段。不要让轮询覆盖未保存文本。图片确认与版本由前后端共同约束，不能绕过 confirmCost。

改接口：先更新 [后端契约](backend-handoff.md) 与 src/types.ts，再改两端。类型声明不能替代服务端输入校验。API Key 始终只留在后端，不能创建 VITE_API_KEY。

扩展 Skill：复制相近指令包、修改 Markdown、在 registry 注册新 ID、新建项目检查 Skill 快照，登记来源许可。不执行扩展包脚本。

## 7. 测试与协作

```powershell
npm run check
npm run test:ui
```

第一条包含 24 项后端测试、严格 TS 检查与构建。第二条在模拟 3100 上运行 Playwright；本机默认使用已安装的 Chrome，CI 安装 Chromium。浏览器测试启动前先构建（check 已完成构建），且会检查 simulation=true 才进行生成。它不能验证真实角色还原效果。

```powershell
git pull --ff-only
git switch -c feat/your-task-name
# 完成修改和上述检查后，仅添加本次文件
git add src/components/ReferencePanel.tsx
git commit -m "feat: improve reference interaction"
git push -u origin feat/your-task-name
```

到 GitHub 建 PR，写清解决的问题、行为与验证。负责人主要改 src/、public/；后端同学改 lib/、server.mjs、test/；测试同学改 docs/qa/。提交前不应包含 .env、data、data-mock、dist、node_modules、未脱敏试用记录。

## 8. 常见问题

- 页面提示尚未构建：运行 npm run build，或使用包含构建步骤的 npm start。
- 端口占用：停止自己认识的旧工作台，不结束其他项目进程。
- 找不到 React/tsc：先 npm ci，检查 Node 版本不低于 22.12。
- 修改组件看不到：5173 支持热更新；3000/3100 的生产页面需要重新 build 后刷新。
- 练习图片都一样：夹具行为，测试操作不测试模型质量。
- 保存后生成按钮不能点：重新检查并确认稿件与本次费用。
- JSON 没有打包图片：备份整个 data，包括 images 与 references。
