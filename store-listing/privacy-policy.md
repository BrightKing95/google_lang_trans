# Quick Translate Privacy Policy / 轻译隐私政策

Effective date / 生效日期：2026-08-30

## English

Quick Translate is a Chrome extension that translates visible webpage text that a user selects or deliberately captures by hovering.

### Data processed

When the user requests a translation, the extension temporarily processes the visible text selected or captured on the current webpage. Chrome's built-in Language Detector and Translator APIs perform language detection and translation on the user's device.

The extension stores only these preferences in `chrome.storage.local`:

- Whether the extension is enabled.
- The selected interaction mode.
- The selected target language.

### Data not collected or transmitted

Quick Translate does not transmit page text, translations, webpage URLs, browsing history, or user preferences to the developer or to a developer-operated server. It does not collect identity, authentication, financial, health, location, communications, or personal-contact data.

The extension contains no analytics, advertising, tracking, account system, remote code, or third-party translation service. Data is not sold, rented, or shared for advertising, credit, or other unrelated purposes.

### Retention and control

Page text and translations exist only temporarily in the current tab's memory and are not written to extension storage. Saved preferences remain on the user's device until they are changed, cleared, or the extension is uninstalled.

### Website access

The extension's content script is available on ordinary HTTP and HTTPS webpages so that its two user-requested interactions can work consistently. It does not run on Chrome internal pages, Chrome Web Store pages, the built-in PDF viewer, or unsupported frames.

### Changes and contact

Material changes to this policy will be published in this repository before an extension update that depends on them is submitted. Questions and privacy requests can be opened at https://github.com/BrightKing95/google_lang_trans/issues.

## 简体中文

轻译是一款 Chrome 扩展，用于翻译用户在网页中选中或主动通过鼠标悬停捕捉的可见文字。

### 处理的数据

当用户发起翻译时，扩展会临时处理当前网页中被选中或捕捉的可见文字。语言检测和翻译由 Chrome 内置的 Language Detector 与 Translator API 在用户设备上完成。

扩展只会在 `chrome.storage.local` 中保存以下偏好：

- 扩展是否启用。
- 当前选择的交互模式。
- 当前选择的目标语言。

### 不收集或传输的数据

轻译不会把网页文字、翻译结果、网页地址、浏览历史或用户偏好传输给开发者或开发者运营的服务器。扩展不会收集身份认证、金融、健康、位置、通信或个人联系信息。

扩展不包含数据分析、广告、跟踪、账号系统、远程代码或第三方翻译服务。数据不会被出售、出租，也不会用于广告、征信或其他无关用途。

### 保存期限与用户控制

网页文字和翻译结果只会临时存在于当前标签页的内存中，不会写入扩展存储。设置偏好会保存在用户设备上，直到用户修改、清除或卸载扩展。

### 网站访问

为了让两种由用户主动触发的交互在普通网页上正常工作，扩展的内容脚本可用于 HTTP 和 HTTPS 网页。扩展不会在 Chrome 内部页面、Chrome 网上应用店页面、内置 PDF 阅读器或不支持的框架中运行。

### 政策变更与联系

如果本政策发生实质变化，相关内容会在依赖该变化的扩展更新提交之前发布到本仓库。如有问题或隐私请求，请通过 https://github.com/BrightKing95/google_lang_trans/issues 联系。
