# Chrome 本机语言翻译扩展设计

- 日期：2026-08-29
- 状态：已完成交互评审，待书面规范复核
- 工作名称：轻译（英文界面名 Quick Translate）

## 1. 概述

本项目实现一个桌面版 Chrome Manifest V3 扩展。用户可在普通网页中通过“选中文字”或“鼠标捕捉”两种互斥模式翻译文本，结果以文本附近的即时浮层呈现。

扩展使用 Chrome 138+ 稳定提供的 Language Detector API 和 Translator API，在浏览器本机完成语言检测和翻译。安装后无需账号、API Key 或自建服务，也不把网页文字发送给第三方翻译接口。

## 2. 目标与成功标准

### 2.1 目标

- 安装后无需配置即可使用。
- 扩展界面文案跟随浏览器系统语言；首版提供简体中文和英文。
- 首次目标语言使用浏览器首选 UI 语言，用户可修改并持久保存。
- 用户可在扩展弹窗中切换两种互斥翻译模式。
- 翻译结果以即时浮层显示，并支持复制、朗读、固定和关闭。
- 首次下载语言包、翻译中、无需翻译、不支持和失败状态均有明确反馈。
- 不保存翻译历史，不调用远程翻译服务。

### 2.2 非目标

首版不提供以下能力：

- Chrome 138 以下版本兼容。
- Chrome 内部页面、Chrome 应用商店、内置 PDF 阅读器。
- 跨域 iframe 内的文本翻译。
- 整页翻译、图片 OCR、字幕翻译或文档上传。
- 云端历史、账号同步、自定义翻译服务或 Google Cloud API。
- 超过 500 个 Unicode 码点的单次鼠标捕捉翻译。

## 3. 平台与技术约束

- 桌面版 Google Chrome 138 或更高版本。
- Manifest V3。
- 原生 TypeScript，不使用 React 或其他 UI 框架。
- 使用 `tsc --noEmit` 做类型检查，使用 esbuild 构建 Popup 与 Content Script，使用 Vitest + jsdom 执行自动化测试。
- 扩展逻辑和样式全部随安装包发布，不加载远程代码。
- Translation 和 Language Detection 必须运行在页面窗口环境；不在 Service Worker 或其他 Web Worker 中调用。
- 内容脚本只注入普通 HTTP/HTTPS 顶层文档。

官方能力参考：

- https://developer.chrome.com/docs/ai/translator-api
- https://developer.chrome.com/docs/ai/built-in-apis

## 4. 用户体验

### 4.1 扩展弹窗

弹窗包含以下控件：

- 总开关：启用或暂停当前扩展。
- 模式分段开关：`选中文字` / `鼠标捕捉`，两者互斥。
- 目标语言选择器：默认取 `chrome.i18n.getUILanguage()` 规范化后的语言；修改后永久保存。
- 当前状态：可用、正在准备语言包或浏览器不支持。

设置保存到 `chrome.storage.local`。所有已打开网页通过 `chrome.storage.onChanged` 实时接收变更，无需刷新。

### 4.2 选中文字模式

1. 用户在网页中创建非空文本选区。
2. 内容脚本在选择操作结束后读取选区纯文本与可视位置。
3. 文本经过清理、长度限制和语言检测。
4. 即时浮层显示在选区附近，并根据视口空间自动选择上方或下方。
5. 新选区替换当前未固定浮层；固定浮层不被自动替换。

内容脚本不处理密码框、输入框、文本域、可编辑区域或扩展自身 Shadow DOM 中的选区，避免干扰编辑操作。

### 4.3 鼠标捕捉模式

1. 指针进入包含可见纯文本的候选元素。
2. 指针在同一候选元素停留 500ms 后触发。
3. 从最近的语义文本块提取文本，优先考虑段落、列表项、标题、表格单元格和短文本容器。
4. 文本规范化并截断到最多 500 个 Unicode 码点；优先在第 500 个码点之前最近的句末标点或空白处截断，没有合适边界时直接截断。
5. 结果浮层显示在候选文本块或指针附近。

指针移开候选区域后等待 250ms 再关闭，以允许用户移入浮层操作。进入浮层或点击“固定”会取消关闭计时。快速经过多个元素时，仅最后一个有效候选请求可以更新浮层。

### 4.4 即时浮层

浮层使用封闭 Shadow DOM 渲染，避免网页 CSS 影响扩展，也避免扩展样式污染网页。动态文字仅通过 `textContent` 写入。

浮层包含：

- 检测到的源语言。
- 译文或当前状态。
- 复制、朗读、固定和关闭操作。

关闭规则：

- 点击页面空白处：立即关闭未固定浮层。
- 按 Esc：关闭当前浮层，无论是否固定。
- 指针离开捕捉区域：250ms 后关闭未固定浮层。
- 模式切换、总开关关闭或页面卸载：清理所有浮层与计时器。
- 同一页面只存在一个浮层。固定后保持显示并暂停新的自动触发，直到用户取消固定、按 Esc 或手动关闭。

## 5. 架构与组件

### 5.1 Popup 设置模块

职责：

- 读取并显示当前设置。
- 校验模式和目标语言。
- 将用户变更写入存储。
- 根据 `chrome.i18n` 消息目录渲染界面文案。

依赖：`chrome.storage`、`chrome.i18n`。

### 5.2 Settings 模块

定义唯一设置模型并处理默认值、迁移、校验和持久化。

```ts
type TranslationMode = 'selection' | 'hover';

interface ExtensionSettings {
  enabled: boolean;
  mode: TranslationMode;
  targetLanguage: string; // 规范化 BCP 47 标签
}
```

默认值：

- `enabled: true`
- `mode: 'selection'`
- `targetLanguage`: 浏览器 UI 语言映射后的受支持代码；`zh-CN`/`zh-SG` 映射为 `zh`，`zh-TW`/`zh-HK`/`zh-MO` 映射为 `zh-Hant`，其他语言先匹配完整标签、再匹配主语言子标签，仍不支持则回退为 `en`

### 5.3 Interaction Controller

职责：

- 根据当前设置只启用一种交互监听器。
- 管理选区事件、悬停防抖、离开延迟和页面关闭事件。
- 为每次翻译分配递增请求 ID；只有最新有效请求能更新未固定浮层。
- 在设置变化时停止旧模式并清理旧状态。
- 浮层固定时暂停选区与悬停触发，取消固定后恢复当前模式。

### 5.4 Text Extractor

职责：

- 从 Selection 或候选元素读取纯文本。悬停候选从事件目标向上查找最近的 `p`、`li`、`h1`–`h6`、`td`、`th`、`blockquote` 或 `figcaption`；没有匹配时使用最近的、包含直接可见文本且不是 `body`/`main`/`article` 的元素。
- 合并连续空白、去除首尾空白并限制长度。
- 排除隐藏内容、表单控件、编辑区域、脚本、样式和扩展宿主节点。
- 返回文本及定位所需的 `DOMRect`。

该模块不依赖翻译 API，可独立测试。

### 5.5 Translation Engine

职责：

- 使用 Language Detector API 检测源语言。
- 检查 Language Detector 可用性；首次下载检测模型时复用“正在准备翻译能力”进度状态。
- 对语言标签执行规范化和支持性检查。
- 源语言与目标语言相同时返回“无需翻译”，不创建 Translator。
- 查询 `Translator.availability()`，区分 `available`、`downloadable`、`downloading` 和 `unavailable`。
- 按源语言/目标语言对缓存 Translator 实例。
- 首次创建时监听 `downloadprogress` 并上报 UI。
- 执行翻译并返回结构化结果，不直接操作 DOM。

```ts
type TranslationState =
  | { kind: 'preparing'; progress?: number }
  | { kind: 'translating'; sourceLanguage: string }
  | { kind: 'success'; sourceLanguage: string; translatedText: string }
  | { kind: 'same-language'; language: string }
  | { kind: 'unsupported'; sourceLanguage?: string; targetLanguage: string }
  | { kind: 'error'; retryable: boolean };
```

同一文字与语言对在当前页面内进行 30 秒内存去重；缓存不写入磁盘，不构成翻译历史。语言等价判断使用规范化后的主语言或明确中文映射，例如 `en-US` 与 `en` 视为相同，`zh` 与 `zh-Hant` 不视为相同。

### 5.6 Overlay Renderer

职责：

- 创建单一 Shadow DOM 宿主。
- 根据 `TranslationState` 渲染加载、成功和错误状态。
- 计算视口内位置，并在滚动、缩放或窗口尺寸变化时重新定位固定浮层。
- 提供复制、朗读、固定、重试和关闭事件。

朗读使用浏览器 `speechSynthesis`。复制由用户点击触发，优先使用 `navigator.clipboard.writeText`；不可用时使用 Shadow DOM 内临时只读 `textarea` 和 `document.execCommand('copy')`，随后立即移除。首版不申请 Clipboard 权限。任何动态内容均作为纯文本处理。

### 5.7 后台职责

首版不包含后台 Service Worker。弹窗和内容脚本直接使用 `chrome.storage` 与 `chrome.i18n`；设置模块在首次读取时合并默认值，因此不需要安装初始化脚本。

## 6. 数据流

1. Popup 写入 `ExtensionSettings`。
2. Content Script 启动时读取设置，并监听后续变更。
3. Interaction Controller 根据模式产生文本候选。
4. Text Extractor 返回规范化文本与定位矩形。
5. Translation Engine 检测语言、检查能力、准备语言包并翻译。
6. Engine 通过状态回调驱动 Overlay Renderer。
7. Controller 比对请求 ID；过期响应被丢弃。
8. Overlay 只显示当前请求结果，不持久保存原文或译文。

## 7. 状态与错误处理

### 7.1 正常状态

- 首次语言包：显示“正在准备翻译能力”和下载进度。
- 翻译中：显示加载状态。
- 成功：显示源语言、译文和操作按钮。
- 相同语言：显示轻量“内容已经是目标语言”提示，1200ms 后自动关闭。

### 7.2 异常状态

- 浏览器版本或 API 不支持：弹窗说明需要 Chrome 138+，页面不注册交互监听器。
- 语言组合不可用：提示用户更换目标语言，不调用远程后备服务。
- 模型下载或翻译失败：显示本地化错误和重试按钮。
- 空文本或不可见文本：静默忽略。
- 页面卸载或节点移除：取消计时器，丢弃后续结果。

错误文案不展示异常堆栈、模型内部信息或网页内容。

## 8. 国际化

使用 Chrome `_locales`：

- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`

Manifest 中声明 `default_locale: "en"`。UI 文案只能通过消息键获取，不在组件中直接写死中文或英文。语言名称优先使用 `Intl.DisplayNames` 按当前 UI 语言显示。

界面语言与目标翻译语言相互独立：界面跟随浏览器系统语言，目标语言由设置决定。

## 9. 权限、隐私与安全

最小权限设计：

- `storage`：保存设置。
- HTTP/HTTPS 普通网页的内容脚本匹配范围：读取用户主动选择或捕捉的可见文字并显示浮层。

首版不申请远程翻译域名、Clipboard、历史记录、Cookie、标签页列表或 Web Request 权限。

安全要求：

- 不使用 `innerHTML` 渲染网页文字或翻译结果。
- 不接受网页传入的 URL、脚本或扩展 API 参数。
- 不把网页文本发送到 Service Worker、远程接口或持久化存储。
- 所有请求状态和 Translator 缓存仅存在于当前页面内存。
- Shadow DOM 宿主使用难冲突的固定标识，并忽略来自自身的事件。

## 10. 测试设计

### 10.1 单元测试

- 设置默认值、语言规范化、模式互斥、校验和迁移。
- 选区与文本块提取、空白规范化、500 个 Unicode 码点限制和排除规则。
- 悬停 500ms 防抖、移开 250ms 延迟、请求 ID 过期丢弃。
- Translation Engine 的全部可用性状态、相同语言、缓存、进度和错误。
- Overlay 状态渲染、定位决策和关闭/固定状态机。

Translator 与 Language Detector 使用可注入适配器和测试替身，测试不下载真实模型。

### 10.2 DOM 集成测试

- 模拟选区后显示正确状态。
- 模拟悬停与快速移动，只有最后一个候选生效。
- 设置变更后监听器切换且旧浮层被清理。
- 页面样式不能穿透封闭 Shadow DOM。
- 动态 DOM、滚动与窗口尺寸变化不产生失效引用。

### 10.3 构建检查

- TypeScript 类型检查通过。
- 单元与 DOM 测试通过。
- Manifest V3 结构合法。
- 构建产物不包含远程可执行代码。
- 打包后的扩展目录可通过 Chrome “加载已解压的扩展程序”安装。

### 10.4 Chrome 138+ 手工验收

- 中文和英文浏览器环境下 UI 文案正确。
- 默认目标语言正确，修改后跨标签页和浏览器重启保留。
- 两种模式互斥，切换后立即生效。
- 首次语言包显示准备进度，之后复用已下载能力。
- 成功、相同语言、不支持、断网和失败状态均符合设计。
- 复制、朗读、固定、Esc 和点击空白关闭可用。
- 动态网页、滚动页面和不同字号下浮层可见且不遮挡目标文本。
- 开发者工具网络面板中没有向第三方翻译服务发送网页文字。

## 11. 验收标准

满足以下条件视为首版完成：

1. Chrome 138+ 可安装并在普通 HTTP/HTTPS 顶层网页运行。
2. UI 自动跟随浏览器语言，至少覆盖英文和简体中文。
3. 默认目标语言来自浏览器 UI 语言，用户选择可持久保存。
4. 选中文字和鼠标捕捉模式可在弹窗中互斥切换。
5. 选区翻译和停留 500ms 的文本块翻译均能显示即时浮层。
6. 单次鼠标捕捉文本不超过 500 个 Unicode 码点。
7. 语言包、翻译中、成功、相同语言、不支持和错误状态均有正确反馈。
8. 复制、朗读、固定和关闭交互通过验收。
9. 扩展不保存翻译历史，不调用远程翻译服务。
10. 自动化测试、类型检查、构建检查和手工验收全部通过。

## 12. 已确认决策

- 界面文案跟随浏览器系统语言。
- 安装后无需配置，最低版本为桌面版 Chrome 138。
- 首次目标语言取浏览器 UI 语言，可修改并持久保存。
- 两种模式由扩展弹窗切换且互斥。
- 结果采用 A 方案“即时浮层”。
- 鼠标捕捉停留阈值为 500ms，最多提取 500 个 Unicode 码点，移开后 250ms 关闭未固定浮层。
- 技术路线为 Manifest V3 + 原生 TypeScript + Shadow DOM + Chrome 内置 Translator/Language Detector API。
