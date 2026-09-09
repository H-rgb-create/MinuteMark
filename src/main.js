const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, safeStorage, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

let mainWindow;
let captureWindow;

app.setName('小记');

function installApplicationMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '退出', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新载入', role: 'reload' },
        { label: '恢复实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭窗口', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于小记',
          click: () => dialog.showMessageBox({
            type: 'info',
            title: '关于小记',
            message: '小记',
            detail: '本地优先的会议记录、截图标注与智能纪要工具。',
            buttons: ['确定']
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const dataFile = () => path.join(app.getPath('userData'), 'meetings.json');
const cloudApiKeyFile = () => path.join(app.getPath('userData'), 'cloud-api-key.bin');
const defaultCloudModel = 'gpt-4.1-mini';
const defaultAnthropicModel = 'deepseek-v4-flash[1M]';

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch {
    return { meetings: [], settings: { cloudApiUrl: 'https://api.openai.com/v1', whisperPath: '', whisperModel: '', ffmpegPath: '' } };
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(dataFile()), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(store, null, 2), 'utf8');
}

const escapeDocumentText = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function safeExportName(title) {
  return String(title || '会议纪要').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim() || '会议纪要';
}

function exportHtmlDocument({ title, date, html }) {
  const cleanHtml = String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(["'])[^"']*\1/gi, '');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeDocumentText(title)}</title><style>
    @page{size:A4;margin:17mm 16mm}*{box-sizing:border-box}body{margin:0;color:#171717;font-family:"Microsoft YaHei","Segoe UI",sans-serif;font-size:11pt;line-height:1.75}h1.document-title{margin:0 0 4px;font-size:24pt;line-height:1.3}.document-date{margin:0 0 24px;color:#777;font-size:9pt;border-bottom:1px solid #ddd;padding-bottom:12px}main h1{font-size:21pt}main h2{font-size:17pt}main h3{font-size:14pt}main h4{font-size:12pt}main h1,main h2,main h3,main h4{page-break-after:avoid;margin:20px 0 8px;line-height:1.4}p{margin:6px 0}ul,ol{margin:7px 0;padding-left:1.6em}li{margin:3px 0}img{display:block;max-width:100%;height:auto;margin:12px 0;border:1px solid #ddd;border-radius:4px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:7px 9px;text-align:left}blockquote{margin:10px 0;padding:6px 12px;border-left:3px solid #222;background:#f5f5f3;color:#555}pre{padding:10px 12px;background:#f4f4f2;white-space:pre-wrap;font-family:Consolas,monospace;font-size:9pt}
  </style></head><body><h1 class="document-title">${escapeDocumentText(title)}</h1><p class="document-date">日期：${escapeDocumentText(date)}</p><main>${cleanHtml}</main></body></html>`;
}

async function exportDocument(payload) {
  const format = String(payload?.format || '').toLowerCase();
  const formats = {
    pdf: { extension: 'pdf', label: 'PDF 文档' },
    word: { extension: 'doc', label: 'Word 文档' },
    md: { extension: 'md', label: 'Markdown 文件' }
  };
  const selected = formats[format];
  if (!selected) return { ok: false, error: '不支持的导出格式。' };
  const fileName = safeExportName(payload.title);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `导出${selected.label}`,
    defaultPath: `${fileName}.${selected.extension}`,
    filters: [{ name: selected.label, extensions: [selected.extension] }]
  });
  if (result.canceled || !result.filePath) return { ok: true, canceled: true };
  try {
    if (format === 'md') {
      await fs.writeFile(result.filePath, String(payload.markdown || ''), 'utf8');
    } else {
      const documentHtml = exportHtmlDocument(payload);
      if (format === 'word') {
        await fs.writeFile(result.filePath, `\ufeff${documentHtml}`, 'utf8');
      } else {
        const printWindow = new BrowserWindow({
          show: false,
          backgroundColor: '#ffffff',
          webPreferences: { javascript: false, nodeIntegration: false, contextIsolation: true, sandbox: true }
        });
        try {
          await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`);
          const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 } });
          await fs.writeFile(result.filePath, pdf);
        } finally {
          if (!printWindow.isDestroyed()) printWindow.destroy();
        }
      }
    }
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: `导出失败：${error.message}` };
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: '#f6f7fb',
    title: '小记',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

async function beginCapture() {
  if (captureWindow) return;
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
  const source = sources.find((item) => item.display_id === String(display.id)) || sources[0];
  if (!source) return;
  const image = source.thumbnail.resize({ width, height });
  captureWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width,
    height,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  captureWindow.setAlwaysOnTop(true, 'screen-saver');
  await captureWindow.loadFile(path.join(__dirname, 'capture.html'));
  captureWindow.webContents.send('capture:source', image.toDataURL());
  captureWindow.on('closed', () => { captureWindow = null; });
}

app.whenReady().then(() => {
  installApplicationMenu();
  createMainWindow();
  globalShortcut.register('CommandOrControl+Shift+A', beginCapture);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

ipcMain.handle('store:load', readStore);
ipcMain.handle('store:save', async (_event, store) => {
  // API keys are kept separately through the OS-backed encrypted store.
  if (store?.settings) delete store.settings.cloudApiKey;
  await writeStore(store);
  return true;
});
ipcMain.handle('document:export', async (_event, payload) => exportDocument(payload));
ipcMain.handle('app:open-capture', beginCapture);
ipcMain.handle('dialog:pick-media', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: '音频与视频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'mpeg', 'mpg'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('settings:cloud-api-key-status', async () => {
  try { await fs.access(cloudApiKeyFile()); return { configured: true, available: safeStorage.isEncryptionAvailable() }; } catch { return { configured: false, available: safeStorage.isEncryptionAvailable() }; }
});
ipcMain.handle('settings:save-cloud-api-key', async (_event, apiKey) => {
  const value = String(apiKey || '').trim();
  try {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: '当前系统无法使用安全存储，未保存 API Key。' };
    if (!value) { await fs.rm(cloudApiKeyFile(), { force: true }); return { ok: true, configured: false }; }
    await fs.writeFile(cloudApiKeyFile(), safeStorage.encryptString(value));
    return { ok: true, configured: true };
  } catch (error) { return { ok: false, error: `保存 API Key 失败：${error.message}` }; }
});
async function readCloudApiKey() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法读取安全存储中的 API Key。');
  try { return safeStorage.decryptString(await fs.readFile(cloudApiKeyFile())); } catch { throw new Error('请先在智能功能设置中填写并保存云端 API Key。'); }
}
function cloudChatConfig(url) {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) throw new Error('请填写云端 API 兼容地址。');
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('云端 API 地址格式无效。'); }
  const protocol = parsed.searchParams.get('protocol') === 'anthropic' ? 'anthropic' : 'openai';
  const model = parsed.searchParams.get('model') || (protocol === 'anthropic' ? defaultAnthropicModel : defaultCloudModel);
  parsed.searchParams.delete('model');
  parsed.searchParams.delete('protocol');
  const base = parsed.toString().replace(/\/$/, '');
  if (protocol === 'anthropic') {
    const endpoint = /\/v1\/messages$/i.test(base) ? base : /\/v1$/i.test(base) ? `${base}/messages` : `${base}/v1/messages`;
    return { endpoint, model, protocol };
  }
  return { endpoint: /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`, model, protocol };
}
ipcMain.handle('ai:summarize', async (_event, { transcript, title, settings }) => {
  const prompt = `你是严谨的中文会议纪要助手。请根据以下会议逐字稿或对话记录，生成可直接粘贴到纪要中的 Markdown。必须包含：会议摘要、核心结论、议题讨论、行动项（表格，含事项/负责人/截止时间/状态）、风险与待确认事项。不要编造参会人、负责人或日期；未知信息请写“待确认”。\n\n会议标题：${title || '未命名会议'}\n\n原始记录：\n${transcript}`;
  try {
    const apiKey = await readCloudApiKey();
    const cloud = cloudChatConfig(settings.cloudApiUrl);
    const request = cloud.protocol === 'anthropic'
      ? {
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, Authorization: `Bearer ${apiKey}`, 'anthropic-version': '2023-06-01' },
        body: { model: cloud.model, max_tokens: 8000, system: '你是一名严谨的中文会议纪要助手。', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }
      }
      : {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: { model: cloud.model, messages: [{ role: 'system', content: '你是一名严谨的中文会议纪要助手。' }, { role: 'user', content: prompt }], temperature: 0.2 }
      };
    const response = await fetch(cloud.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`云端服务返回状态 ${response.status}${detail ? `：${detail}` : ''}`);
    }
    const result = await response.json();
    const markdown = cloud.protocol === 'anthropic'
      ? result.content?.filter((item) => item.type === 'text').map((item) => item.text).join('')
      : result.choices?.[0]?.message?.content;
    if (!markdown || typeof markdown !== 'string') throw new Error('云端模型没有返回纪要内容；请确认该服务支持 Chat Completions 接口。');
    return { ok: true, markdown };
  } catch (error) { return { ok: false, error: `智能整理失败：${error.message}` }; }
});
function run(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { windowsHide: true }); let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `${path.basename(command)} 退出码：${code}`))); }); }
ipcMain.handle('ai:transcribe', async (_event, { audioPath, settings }) => {
  if (!settings.whisperPath || !settings.whisperModel) return { ok: false, error: '请先在智能功能设置中填写语音转写程序路径和语音识别模型路径。' };
  try {
    await fs.access(audioPath); await fs.access(settings.whisperPath); await fs.access(settings.whisperModel);
    const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'minutemark-'));
    let input = audioPath;
    if (path.extname(audioPath).toLowerCase() !== '.wav') {
      if (!settings.ffmpegPath) return { ok: false, error: '压缩音频或视频需要先在智能功能设置中填写音视频转换程序路径；波形音频文件可直接转写。' };
      input = path.join(tempDir, 'audio.wav');
      await run(settings.ffmpegPath, ['-y', '-i', audioPath, '-vn', '-ar', '16000', '-ac', '1', input]);
    }
    const outputBase = path.join(tempDir, 'transcript');
    await run(settings.whisperPath, ['-m', settings.whisperModel, '-f', input, '-of', outputBase, '-otxt']);
    const transcript = await fs.readFile(`${outputBase}.txt`, 'utf8');
    return { ok: true, transcript };
  } catch (error) { return { ok: false, error: `本地转写失败：${error.message}` }; }
});
ipcMain.on('capture:done', (_event, imageDataUrl) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('capture:insert', imageDataUrl);
  }
  captureWindow?.close();
});
ipcMain.on('capture:cancel', () => captureWindow?.close());
