# MinuteMark

本地优先的 Windows 会议纪要助手。第一阶段已实现：创建并编辑会议纪要、本地自动保存、Markdown 导出，以及 `Ctrl + Shift + A` 全局截图、框选、箭头/方框/画笔/文字标注并插入当前纪要。

## 本地启动

需要 Node.js 22+ 与 pnpm。

```powershell
pnpm install
pnpm start
```

如果 pnpm 第一次询问是否允许 Electron 的安装脚本，选择 `electron` 并确认。数据保存在 Windows 的应用数据目录，不会自动发送到网络。

## 当前阶段与后续阶段

1. **已完成：本地记录与截图标注** — 手动会议记录、会议模板、自动保存、导出、全局快捷截图及基础标注。
2. **已完成：AI 纪要与媒体转写** — 可粘贴对话记录，使用兼容 OpenAI Chat Completions 的云端模型生成摘要、决议和行动项；使用本机 Whisper CLI + FFmpeg 导入音频或视频并转写。
3. **后续增强** — 说话人区分、OCR、录音和搜索。

## 工程说明

- `src/main.js`：窗口、全局快捷键、屏幕采集及本地数据持久化。
- `src/renderer.js`：会议列表、纪要编辑、模板和 Markdown 导出。
- `src/capture.js`：截图选区、标注和图片裁切。

## 智能功能配置

1. 在“智能功能设置”中填写云端大模型的 OpenAI 兼容 API 地址、模型名和 API Key。API Key 使用系统安全存储加密保存，不会写入会议数据。
2. 音频与视频转写需填写本地 `whisper-cli.exe` 和 Whisper GGML 模型的绝对路径。
3. WAV 可直接转写；MP3、M4A 和视频需填写 `ffmpeg.exe` 路径。视频会先在本机提取为 16 kHz 单声道 WAV，再由 Whisper 转为文字。

MinuteMark 会将逐字稿发送给你配置的云端模型以生成纪要；原始音频、视频和本地转写均在本机处理。

## 开源许可

本项目采用 [MIT License](LICENSE)。
