# 角色参考图：使用、实现与接手

v0.5 新增，2026-09-27。复用已有百炼密钥及 `wan2.7-image` / `wan2.7-image-pro`，无需另配模型。官方接口支持图像输入与文字共同生成，见 [万相 API 文档](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)。服务支持多图，本产品当前每次选择一张，以便清楚区分角色来源。

## 怎么使用

1. 新建图片或漫画项目，或打开已有项目。提示词默认折叠，点击右侧“展开编辑”核对；创作稿各格可分别展开。
2. 在“让画面真正出现”区域点击“上传角色参考图”。项目一创建就可上传，不必等到草稿确认。
3. 查看缩略图，“这次生图使用”会选中新上传的图片。想换图可上传另一张或选择已保存素材；选择“不使用参考图”恢复纯文字生成。漫画后续格还可选择“沿用已生成的第一格”。
4. 确认草稿、选择画面、勾选本次费用，再生成。切换画面或参考来源会清除费用勾选，需再次确认。
5. 任务卡片记录参考图名称。重新生成会创建新任务并可能再次计费；上传、预览和选择参考图不调用模型。

同人画面建议用一张脸和服装清楚、无遮挡的单角色图，文字主要说明新动作、场景和镜头。例如：“参考图中的角色站在黄昏的海边，半身近景，保持原有发型、瞳色和制服，手里拿着一封信。”复杂设定表、多角色拼图可能让模型混淆；参考图能提供视觉约束，但没有经过质量对照试验，不能承诺完全还原。

提示词子 Agent 仍是文本流程，不会分析上传的图。图像在生图时直接传给万相；最终提示词明确要求身份、脸型、发型、瞳色、服装和配饰优先参考图片，文字负责新场景和动作，自动补充的外貌与图冲突时以图为准。用户可以展开每个任务的实际提示词核对。

## 图片和隐私边界

- 输入 PNG/JPEG/WebP，最大 20 MB；宽高各 240–8000 像素，宽高比不超过 8:1。
- 浏览器解码、等比缩小到最长边 2048，透明背景铺白，重编码为 JPEG。这样也移除原图片附带的 EXIF 信息；原文件不会被改写。
- 服务器仅接收转换后 5 MB 以内的 JPEG，并独立检查 Base64、JPEG 容器/编码头、尺寸和比例。这是结构检查，不是完整 JPEG 像素解码器。
- 同一项目最多保存 12 张不同内容，SHA256 相同则复用。素材只增加到项目素材库，不改变草稿 revision 或批准状态；生图请求显式指定所选素材。
- 文件保存在 `data/references/<projectId>/<referenceId>.jpg`，练习模式对应 `data-mock/references/`。上传与生成图片均不提交到 Git。
- 切换为“不使用参考图”不删除已保存素材。当前没有素材删除接口；备份要连同项目 JSON 一起备份整个数据目录。任务保留原有引用，不会因为上传新图而悄悄替换。
- 上传先保存本机，只有明确点击生图才会把选中的图发送给百炼。前端不接触服务密钥。

## 后端接口

### 添加项目素材

`POST /api/projects/:id/references`，同源 JSON，与项目写操作共用锁：

```json
{
  "revision": 2,
  "name": "角色立绘.jpg",
  "dataUrl": "data:image/jpeg;base64,完整内容"
}
```

成功 200 返回 `{ project, reference }`，包括重复内容复用。reference 字段：id、name、mimeType、width、height、bytes、sha256、createdAt、asset。asset 是同源 `/api/projects/:id/references/:referenceId/file`。不返回本地磁盘路径，不在项目 JSON 中保存 Base64。

name 最长 120 字符。旧 revision / 项目繁忙 409，错误格式或尺寸 400，体积超限 413，跨站 Origin 403。此路由正文上限 `ceil(5 MiB / 3) * 4 + 4096` 字节；其他 JSON 路由仍为 98,304 字节。素材名称只作展示，落盘路径使用服务端 UUID。

### 预览素材

`GET /api/projects/:id/references/:referenceId/file` 返回 `image/jpeg`，仅可访问属于该项目的素材；不存在或跨项目引用 404。该服务仍是本机单用户，没有账号权限体系。

### 带参考生图

```json
{
  "revision": 2,
  "unitIndex": 0,
  "confirmCost": true,
  "referenceUploadId": "上传响应的reference.id"
}
```

提交到原有 `POST /api/projects/:id/images`。`referenceUploadId` 与 `referenceJobId` 互斥，不传任何一个表示纯文字生图。`replaceJobId`、版本检查、费用确认和幂等语义不变；已有任务不会因改参考图而自动重新提交，重新生成须传最新任务 ID。

服务端读取素材文件，临时编码为 `referenceImage` 传入既有 ImageProvider.submit。真实请求的 `input.messages[0].content` 包含 `{image: dataURL}` 和 `{text: prompt}`；不是把图名写入提示词冒充视觉输入。job 保存 referenceUploadId / referenceName；使用生成图时仍保存 referenceJobId。

## 文件与队友任务

| 文件 | 职责 |
| --- | --- |
| `public/references.js` | 浏览器解码压缩、上传、预览、参考来源选择和费用重置 |
| `lib/references.mjs` | 校验、去重、文件存储、按项目读取 |
| `lib/images.mjs` | 选择一张参考图，记录来源，构造图文输入并提交 |
| `public/app.js` / `index.html` / `style.css` | 提示词折叠、分格摘要、参考卡片布局 |
| `test/references.test.mjs` | 文件结构与大小、持久化、来源隔离、HTTP、模型输入与费用门禁 |
| `test/fixtures/reference.jpg` | 自动测试专用的纯色 JPEG，不代表生成结果 |

后端队友继续做 [交接文档](backend-handoff.md) 的后台查询 worker；涉及媒体请求时保持 referenceUploadId / referenceJobId 互斥和素材文件读取边界。初学者可用 `npm run dev:mock` 完成上传、切换、重开、错误文件与手机布局回归；付费质量对照另行记录，不把模拟图当作还原效果。人工新增检查见 [manual-checklist](qa/manual-checklist.md)。
