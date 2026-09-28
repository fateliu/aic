# React + TypeScript + Tailwind 迁移与工具调研

v0.6，2026-09-28。项目已把浏览器前端迁移为 React 组件；后端 HTTP、模型服务、项目 JSON、图片和参考图的存储格式保持兼容。

## 网上有哪些转换工具

以下为本次查看的产品或项目官方页面。这里只核实公开能力说明，没有购买服务，也没有把仓库、私有项目或密钥上传到第三方。自动生成质量和复杂业务兼容性未作实测，不能理解为推荐付费或保证一键完成。

| 工具 | 公开提供的功能 | 在本项目里的用途与限制 |
| --- | --- | --- |
| [Transform Tools：HTML to JSX](https://transform.tools/html-to-jsx) | 在线 HTML → JSX 转换 | 辅助转属性与标签；状态、接口、轮询仍要设计 |
| [Element Armory](https://elementarmory.com/tools/html-to-react) | HTML 转 React JSX，可选 CSS → Tailwind | 可用来处理静态片段；没有验证它能迁移本项目整个 JS 工作流 |
| [CopyWeb](https://copyweb.net/html-to-react) | 官方称支持粘贴 HTML/CSS，生成拆分的 React/Tailwind 组件 | 可作为 AI 转换工具考察；这里未使用其生成代码或核实商业套餐 |
| [html-to-react-components](https://github.com/roman01la/html-to-react-components) | 使用 data-component 标记从 HTML 抽取组件，支持 TypeScript 输出 | 更接近结构拆分工具；业务事件仍需人工接回 |

“三件套转 React”有不同层次：HTML 转 JSX 只是语法；组件拆分需要划分职责；完整应用还包括状态归属、异步取消、错误处理、数据类型与测试。根据这些工具的公开描述以及本项目现有功能，不能推断它们能无损迁移付费生图和版本门禁。

## 本次参考的实际例子

1. [React 官方：把 React 加入已有项目](https://react.dev/learn/add-react-to-an-existing-project)。示例在现有页面挂载组件，也介绍没有构建环境时接入 Vite。本项目采用一个 React 根节点和现有 Node 后端组合。
2. [Thinking in React：可搜索商品表](https://react.dev/learn/thinking-in-react)。从 JSON API 和静态稿开始，拆组件、确定最小状态、建立数据流。这里按相同方法拆创作表单、编辑器、参考图与图片任务。
3. [Vite 官方 React + TS 模板](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts)。用作工程结构参考，没有整包覆盖旧仓库。
4. [Tailwind 官方 Vite 接入](https://tailwindcss.com/docs/installation/using-vite)。通过 @tailwindcss/vite 编译工具类，不使用运行时 CDN。

## 已完成的结构

```text
index.html → src/main.tsx → App.tsx
                         ├─ Shell：顶部、档案、主视觉、主题与背景
                         ├─ Composer：想法、类型、引擎与 Skills
                         └─ ProjectEditor
                             ├─ 提示词折叠 / 分格编辑 / 确认 / 导出
                             └─ ImagePanel
                                 ├─ ReferencePanel
                                 └─ 图片任务卡片
```

- React 管理组件渲染和受控表单；没有用 innerHTML 或把旧 DOM 脚本塞进 useEffect 的方式包装旧应用。
- TypeScript 严格检查。项目、图片任务、参考图、Skill、配置等类型在 src/types.ts。
- useStudio 协调 API 和操作状态；state/project.ts 管理已保存项目和未保存编辑。媒体轮询只合并当前项目、当前 revision 的图片任务和 trace，不覆盖编辑文本。
- useImageJobs 管理定时查询、取消请求和失败暂停；组件离开后清理定时器与请求。不自动重提生成。
- 费用确认绑定项目、版本、画面、参考来源及现有任务状态。任一变化就不再满足原确认。
- 原生六个前端入口文件已移除。旧版项目仍通过 API 读取和原有导出接口处理。

## Tailwind 如何使用

src/styles/index.css 接入 Tailwind theme/utilities，定义 studio-accent、studio-paper、studio-line 等语义颜色。组件用 grid、flex、gap、响应式断点、字号、边框等工具类描述常规布局。

src/styles/visual.css 保留现有红蓝色板、斜切构图、人物裁切和动效，放在 components 层。没有把所有独特视觉硬塞成巨大的 className。暂不引入 Tailwind Preflight，以保留已有表单和文字默认表现；新控件的边框宽度需明确写出。美术素材仍在 public/assets。

## 启动与测试

首次执行 npm ci。启动命令：

| 命令 | 页面与后端 |
| --- | --- |
| npm start | 类型检查 + 生产构建 + Node；页面/API 均为 3000 |
| npm run dev:mock | 构建 + 无密钥模拟后端；页面/API 均为 3100 |
| npm run dev | React 热更新页面 5173，真实后端 3000 |
| npm run dev:mock:ui | React 热更新页面 5173，模拟后端 3100 |
| npm run check | 后端测试、严格类型检查、生产构建 |
| npm run test:ui | Playwright 在模拟服务上跑浏览器回归 |

开发启动脚本遇到已占用的后端端口会报错退出，避免悄悄连错真实/模拟服务。开发界面通过 Vite 代理相对路径 /api；仅将本机 5173 页面的 Origin 适配为后端来源，其他跨站 Origin 继续被拒绝。开发时后端修改需重启命令；前端 TSX/CSS 保存后热更新。

生产包在 dist/，不提交 Git；Node 只提供首页和 /build/ 下的 JS/CSS 白名单。public/assets 的图片继续使用原有白名单。未构建时首页提示 npm run build；API 可独立运行，便于后端同学开发。

## 已验证与限制

已通过 TypeScript、生产构建、24 个后端用例和 7 个 Playwright 用例。浏览器用例覆盖四格生成与 PNG 下载、参考来源切换、编辑确认失效、四种类型、主题背景、五种宽度、旧轮询响应的合并边界、网络失败暂停/恢复，以及旧版项目的编辑与 SVG 导出。开发代理、CSS 热更新和输入保留也已实际验证。浏览器测试使用模拟提供方，没有新增真实模型费用，不代表角色还原效果或模型成功率。详见 [测试报告](test-report.md)。

已有本机数据无需迁移。Node 最低版本提高为 22.12；首次运行需要安装 npm 依赖。远端 CI 是否通过以该提交的 GitHub Actions 结果为准。
