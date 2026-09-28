# 后端交接与接口约定 v0.6

这份文档描述**已经存在的接口**。服务端图片 worker、数据库、多用户登录、视频渲染属于待开发内容。接手前先运行 `npm test` 和 `npm run dev:mock`，阅读 `server.mjs`、`lib/studio.mjs`、`lib/images.mjs`。

前端已迁到 React + TypeScript；首次运行 `npm ci`。请求封装在 `src/lib/api.ts`，数据类型在 `src/types.ts`，工作流在 `src/hooks/`。生产页面由 Node 提供 `dist/` 中的构建资源；开发页面为 Vite 5173，通过代理访问真实 3000 或模拟 3100。代理只适配本机开发页面的 Origin，后端现有同源门禁保持。接口变动需同步类型和组件，不再修改旧 public/app.js。

## 1. 边界与配置

- 正常服务：`http://127.0.0.1:3000`；无密钥练习：`http://127.0.0.1:3100`。当前前后端同源，前端调用相对路径 `/api/...`。
- 写请求使用 `Content-Type: application/json`，普通正文上限 98,304 字节。仅参考图上传使用单独的 Base64 体积上限，见下文。当前只接受本机 Host 和同源 Origin；没有用户登录，也没有跨域前端配置。
- 密钥只在后端读取 `.env`。`GET /api/config` 只返回是否配置，不返回 Key。练习入口显式禁用真实文本服务并注入模拟图片服务。
- createApp 返回原生 Node HTTP Server。可注入 directory、refiner、studio、imageProvider 等依赖；正式启动入口才加载 `.env`。
- 后端如要改语言或框架，应先保持本文请求/响应一致，通过现有流程验收，再协商迁移。当前不需要重做前端。

## 2. 项目数据

新项目主要形状如下（省略时间戳、trace、Skill 完整内容等字段）：

```json
{
  "id": "服务端生成的UUID",
  "schemaVersion": 2,
  "revision": 0,
  "status": "draft",
  "mode": "demo",
  "brief": {
    "name": "云端来信",
    "prompt": "蓝围巾白猫收到一封信，温暖四格故事",
    "kind": "comic",
    "ratio": "1:1",
    "style": "日系动画"
  },
  "refinement": null,
  "creative": null,
  "skills": [],
  "trace": []
}
```

revision 从 0 开始。refine 成功、修改 refinement、generate 成功、修改 creative 都递增；approve 不递增。前端显示“第 N 版”时使用 revision + 1。图片任务的 revision 永远是技术版本原值。

项目状态：`draft → refining → prompt_review → generating → review → approved`。模型阶段失败为 `failed` 并保留 error / lastOperation；编辑设定回到 prompt_review 并清空草稿；编辑草稿回到 review 并撤销确认。

字段限制：name 60 字符，prompt 3000，style 80；kind 为 text/image/comic/animation；ratio 为 16:9、9:16、1:1。refinement 的 refinedPrompt 6000、characterAnchor / negativePrompt 各 1500；assumptions / questions 各最多 8 条，每条 300。creative 的 headline 60、intro 3000、每个 visual 1500、narration 400。常规限制按 JavaScript 字符串长度执行；生图最终提示词按 Unicode 码点限制到 5000。

## 3. 按调用顺序对接

以下响应除创建状态码 201 外，成功默认 200。成功的项目写操作返回**完整更新后项目**（参考图上传为 `{project,reference}`），前端必须取返回的 revision，不能自行推算并发状态。

### 创建

`POST /api/projects`

```json
{
  "brief": {"name":"云端来信","prompt":"蓝围巾白猫收到一封信，温暖四格故事","kind":"comic","ratio":"1:1","style":"日系动画"},
  "mode":"demo",
  "skillIds":["comic-continuity"]
}
```

mode 支持 demo/deepseek/ollama；真实模式要求对应服务已配置。最多三个适用 Skill，创建时固定内容快照。

### 提示词阶段

`POST /api/projects/:id/refine`：`{"revision":0}`。返回 refinement：

```json
{
  "refinedPrompt":"完整优化设定",
  "characterAnchor":"蓝围巾白猫，蓝眼睛，无其他衣服",
  "negativePrompt":"无文字和水印",
  "assumptions":["建议使用暖色光"],
  "questions":["故事发生在室内还是室外？"]
}
```

编辑使用 `PATCH /api/projects/:id/refinement`，正文为 `{"revision":1,"refinement":{...完整字段...}}`。程序不会把局部字段自动合并；必须保留两个数组。用户在界面检查、勾选后才继续；后端没有单独的 prompt_approved 状态。

### 草稿阶段

`POST /api/projects/:id/generate`：传当前 `{"revision":N}`。creative 包含 headline、intro、shots。shots 中每项是 visual、narration、duration。文字/图片需要 1 项，漫画 4 项，动画 3 项；动画 duration 固定 5，其他为 0。

编辑使用 `PATCH /api/projects/:id/creative`：`{"revision":N,"creative":{"headline":"标题","intro":"正文","shots":[{"visual":"画面描述","narration":"对白，可空"}]}}`。示例是单图结构，漫画须提供四项；duration 由服务端按类型统一。

确认使用 `POST /api/projects/:id/approve`：`{"revision":N}`，使当前 review/approved 草稿处于 approved。与模型工具 review_creative 不同，这一步代表用户确认。

### 图片阶段

上传用户角色参考图：`POST /api/projects/:id/references`，正文 `{revision,name,dataUrl}`。前端先解码并转换为不透明 JPEG，dataUrl 使用 `data:image/jpeg;base64,...`。返回 `{project,reference}`，只保存素材，不调用模型，不改变草稿确认。每项目最多 12 张，按 SHA256 去重。宽高 240–2048、比例最多 8:1、文件最多 5 MiB；该路由 JSON 上限 `ceil(5 MiB / 3) * 4 + 4096`。

`GET /api/projects/:id/references/:referenceId/file` 读取同项目 JPEG，素材记录位于 `project.references`，文件位于 `data/references/`。完整字段、限制与错误语义见 [角色参考图接口](reference-images.md)。

`POST /api/projects/:id/images`：

```json
{"revision":3,"unitIndex":0,"confirmCost":true}
```

unitIndex 从 0 开始。要求新版图片/漫画项目、最新 approved 版本。返回 project.imageJobs；每次最多提交一张。

再次生成同一格须加 `replaceJobId`，值为当前那格的最新旧任务 ID；只有成功、失败或取消的任务可明确替换。重复的相同替换请求返回已创建的新任务。

单张图片或漫画可加 `referenceUploadId`，引用本项目上传素材。漫画也可加 `referenceJobId`：当前项目、当前 revision 的成功图片 jobId。两者互斥；不传表示纯文字生图。服务端读取所选本地图片并临时编码给提供方，项目 JSON 不保存参考图二进制。每个请求由前端明确选择来源，上传新图不会修改已有任务。

job 常用字段：id、revision、unitIndex、model、prompt、size、status、taskId、asset、error、lastPollError、referenceJobId、referenceUploadId、referenceName、replaces、createdAt/updatedAt。taskId 是供应商 ID，不能替代本地 jobId；asset 是本机 `/api/.../file` 路径。

`POST /api/projects/:id/images/:jobId/refresh` 使用 `{}`，只查询/下载已有任务。

`POST /api/projects/:id/images/:jobId/recover` 使用 `{"taskId":"控制台中的供应商任务ID"}`，用于 SUBMIT_UNKNOWN / UNKNOWN，不创建新任务。

`GET /api/projects/:id/images/:jobId/file` 返回 `image/png`；加 `?download=1` 返回附件下载头。

图片状态：SUBMITTING、PENDING、RUNNING、SUCCEEDED、FAILED、CANCELED、UNKNOWN、SUBMIT_UNKNOWN、DOWNLOAD_FAILED。最后两个是本软件的恢复状态。SUCCEEDED 必须表示 PNG 已保存成功，不能只表示供应商返回了地址。

### 读取与导出

| 方法与路径 | 返回 |
| --- | --- |
| `GET /api/config` | brand、模型是否配置、theme、media.image/imageModel/simulation/animation |
| `GET /api/skills` | 可用 Skill 元数据数组 |
| `GET /api/projects` | 简表数组：id/name/kind/status/updatedAt/provider |
| `GET /api/projects/:id` | 完整项目 |
| `GET /api/projects/:id/export?format=txt` | approved 项目的 TXT 附件 |
| `GET /api/projects/:id/export?format=json` | 完整项目 JSON 与 copy/media；不包含 PNG 二进制 |
| `POST /api/projects/:id/media-request` | `{status,message,request}`；只返回任务说明，不提交模型 |

旧版 schemaVersion 1 另有 SVG 导出；新前端开发优先针对 schemaVersion 2，不移除旧数据兼容。

## 4. 错误与并发

普通错误形状为 `{"error":"用户可读说明"}`。常见 HTTP：400 参数/业务错误，403 非本机或跨站，404 不存在，405 方法不符，409 版本冲突/确认不满足/项目繁忙，413 过大，415 非 JSON。当前并非所有内部错误都有稳定机器码。

注意两个兼容行为：文本模型阶段失败仍可能 HTTP 200，项目 status=failed；图片供应商失败也可能 HTTP 200，job.status=FAILED/SUBMIT_UNKNOWN。前端必须检查业务状态，不能仅用 response.ok 判定生成成功。

同一进程、同一项目的写操作共用锁。持久化在远程生图提交前执行，无法确定远端是否收到时禁止自动再提交。未来 worker 必须与 HTTP 使用相同锁，且只处理已有 taskId，不能绕过 confirmCost。

## 5. 图片服务适配器

类型定义：`lib/image-provider.d.ts`。实际实现：`createImageProvider()`；可运行模拟实现：`scripts/dev-mock.mjs`。

```js
const app = createApp({
  directory: './my-local-data',
  imageProvider: myProvider
});
app.listen(3101, '127.0.0.1');
```

适配器只提供 available/model/baseUrl、submit、query、download。费用门禁、项目版本、文件保存、去重与 replaces 由 lib/images.mjs 的编排函数负责。不要在 provider 内额外重试付费 POST。

submit 异常若任务可能已经创建，必须设置 `error.uncertain = true`。query 统一状态名称；download 返回 PNG 字节，负责下载地址限制、大小、超时、响应校验，不能把 API Authorization 头发给素材存储地址。真实提供方 simulation 必须为 false/未设置。

## 6. 目前留给你的第一项开发

实现 B02 后台查询：持久项目中选择有 taskId 的 PENDING/RUNNING/DOWNLOAD_FAILED；经共享锁调用现有 refreshImage；限制查询并发和频率；保存后退出锁。启动恢复时处理已有任务，绝不自动补发 SUBMIT_UNKNOWN。用假提供方测试“关闭页面仍完成”“重启恢复”“HTTP 同时刷新”“异常不重复扣费”。

这段是开发要求，当前尚无后台 worker。现在的查询由网页定时器驱动。
