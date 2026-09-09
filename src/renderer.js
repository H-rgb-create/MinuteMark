const appEl = document.querySelector('#app');

const defaultSettings = {
  cloudApiUrl: 'https://api.openai.com/v1',
  whisperPath: '',
  whisperModel: '',
  ffmpegPath: '',
  sidebarCollapsed: false,
  outlineCollapsed: false,
  appZoom: 1,
  projectCollapsed: {}
};

const initialContent = '<h2>会议目标</h2><p><br></p><h2>讨论与结论</h2><p><br></p><h2>行动项</h2><ul><li>待补充</li></ul>';
let store = { projects: [], meetings: [], settings: { ...defaultSettings } };
let activeId = null;
let saveTimer = null;
let outlineSequence = 0;
let outlineUpdateFrame = null;
let draggingMeetingId = null;

const activeMeeting = () => store.meetings.find((item) => item.id === activeId);
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const newMeeting = (projectId = store.projects[0]?.id || null) => ({ id: crypto.randomUUID(), projectId, archivedAt: null, title: '未命名会议', date: new Date().toISOString().slice(0, 10), content: initialContent, createdAt: Date.now(), updatedAt: Date.now() });

function ensureStoreShape() {
  if (!Array.isArray(store.projects) || !store.projects.length) {
    store.projects = [{ id: crypto.randomUUID(), name: '我的会议', createdAt: Date.now() }];
  }
  if (!Array.isArray(store.meetings)) store.meetings = [];
  const defaultProjectId = store.projects[0].id;
  store.meetings.forEach((meeting) => {
    if (!store.projects.some((project) => project.id === meeting.projectId)) meeting.projectId = defaultProjectId;
    if (meeting.archivedAt === undefined) meeting.archivedAt = null;
  });
  if (!store.settings.projectCollapsed || typeof store.settings.projectCollapsed !== 'object') store.settings.projectCollapsed = {};
}

function meetingRow(item, context = 'project') {
  return `<div class="meeting-row ${item.id === activeId ? 'active' : ''}" data-context="${context}" data-meeting-id="${item.id}" draggable="true" title="可拖拽到其他项目或已归档">
    <button class="meeting-open" data-id="${item.id}" title="${escapeHtml(item.title)}"><strong>${escapeHtml(item.title)}</strong><small>${item.date}</small></button>
    <button class="meeting-more" data-meeting-menu="${item.id}" title="会议操作" aria-label="会议操作">•••</button>
  </div>`;
}

function toast(message) {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 2200);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.minuteMark.saveStore(store), 450);
}

function render() {
  ensureStoreShape();
  let activeMeetings = store.meetings.filter((item) => !item.archivedAt);
  if (!activeMeetings.length) {
    const meeting = newMeeting();
    store.meetings.push(meeting);
    activeMeetings = [meeting];
    activeId = meeting.id;
    scheduleSave();
  }
  if (!activeMeeting() || activeMeeting().archivedAt) activeId = activeMeetings[0].id;
  const meeting = activeMeeting();
  const recent = [...activeMeetings].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const archivedCount = store.meetings.filter((item) => item.archivedAt).length;

  document.body.classList.toggle('sidebar-collapsed', Boolean(store.settings.sidebarCollapsed));
  document.body.classList.toggle('outline-collapsed', Boolean(store.settings.outlineCollapsed));

  appEl.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><img class="brand-logo" src="assets/xiaoji-logo.svg" alt="小记图标"></span><span class="brand-label">小记</span><button class="sidebar-toggle" id="sidebar-toggle" title="${store.settings.sidebarCollapsed ? '展开工作台' : '收起工作台'}" aria-label="${store.settings.sidebarCollapsed ? '展开工作台' : '收起工作台'}">${store.settings.sidebarCollapsed ? '›' : '‹'}</button></div>
      <div class="sidebar-ai-wrap"><button class="sidebar-ai-button" id="sidebar-ai-menu" title="AI纪要"><span class="sidebar-action-icon">✦</span><span class="sidebar-action-label">AI纪要</span></button><div class="sidebar-ai-popover hidden"><button id="sidebar-paste">粘贴对话记录</button><button id="sidebar-media">导入音频或视频</button><button id="sidebar-settings">智能功能设置</button></div></div>
      <button class="new-meeting" id="new-meeting" title="新建会议"><span class="sidebar-action-icon">＋</span><span class="sidebar-action-label">新建会议</span></button>
      <div class="sidebar-scroll">
        <div class="sidebar-section-head"><span>项目</span><button id="new-project" title="新建项目" aria-label="新建项目">＋</button></div>
        <div class="project-list">${store.projects.map((project) => {
          const collapsed = Boolean(store.settings.projectCollapsed[project.id]);
          const meetings = activeMeetings.filter((item) => item.projectId === project.id).sort((a, b) => b.updatedAt - a.updatedAt);
          return `<section class="project-group ${collapsed ? 'collapsed' : ''}">
            <div class="project-row" data-project-drop="${project.id}"><button class="project-toggle" data-project-toggle="${project.id}" title="${collapsed ? '展开项目' : '收起项目'}"><span class="project-chevron">${collapsed ? '›' : '⌄'}</span><span class="project-folder">▱</span><strong>${escapeHtml(project.name)}</strong><small>${meetings.length}</small></button><button class="project-more" data-project-menu="${project.id}" title="项目操作">•••</button></div>
            <div class="project-meetings">${meetings.length ? meetings.map((item) => meetingRow(item, 'project')).join('') : '<p class="project-empty">暂无会议</p>'}</div>
          </section>`;
        }).join('')}</div>
        <div class="meeting-label">最近</div>
        <div class="recent-list">${recent.map((item) => meetingRow(item, 'recent')).join('')}</div>
      </div>
      <button class="archive-entry" id="open-archive"><span>▣</span><strong>已归档</strong><small>${archivedCount}</small></button>
      <div class="local-note">● 本地优先保存<br>智能处理数据仅发送至本机服务</div>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <span class="status">${new Date(meeting.updatedAt).toLocaleString('zh-CN')} · 自动保存</span>
        <div class="actions"><button class="ghost zoom-reset ${(store.settings.appZoom || 1) !== 1 ? 'active' : ''}" id="app-zoom" title="按住控制键滚动鼠标滚轮缩放整个界面；点击恢复原始大小">${Math.round((store.settings.appZoom || 1) * 100)}%</button><div class="export-wrap"><button class="ghost" id="export-menu-trigger" aria-haspopup="menu" aria-expanded="false">导出纪要 <span class="export-chevron">⌄</span></button><div class="export-popover hidden" role="menu"><button data-export-format="pdf" role="menuitem"><b>PDF</b><span>适合打印和分享</span></button><button data-export-format="word" role="menuitem"><b>Word</b><span>可继续编辑</span></button><button data-export-format="md" role="menuitem"><b>MD</b><span>纯文本格式</span></button></div></div><button class="capture-btn" id="capture">截图标注 <span class="shortcut">Ctrl ⇧ A</span></button><button class="focus-icon" id="focus-mode" title="进入专注模式" aria-label="进入专注模式"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></button></div>
      </header>
      <aside class="outline-panel" aria-label="文档目录">
        <div class="outline-head"><strong><span class="outline-icon">≡</span><span class="outline-label">目录</span></strong><button id="outline-toggle" title="${store.settings.outlineCollapsed ? '展开目录' : '收起目录'}" aria-label="${store.settings.outlineCollapsed ? '展开目录' : '收起目录'}">${store.settings.outlineCollapsed ? '›' : '‹'}</button></div>
        <nav class="outline-list" id="outline-list"></nav>
      </aside>
      <section class="editor-shell">
        <div class="meta"><input class="meeting-title" id="meeting-title" value="${escapeHtml(meeting.title)}"><input class="date-input" id="meeting-date" type="date" value="${meeting.date}"></div>
        <div class="template"><button data-template="summary">插入会议摘要</button><button data-template="decision">插入决议区</button><button data-template="action">插入行动项</button><button data-template="risk">插入风险项</button></div>
        <article class="editor" id="editor" contenteditable="true">${meeting.content}</article>
        <div class="editor-footer"><button class="extract-actions" id="extract-actions">✦ 提取行动项</button></div>
      </section>
    </main>`;

  bindWorkspaceEvents();
}

function bindWorkspaceEvents() {
  document.querySelectorAll('.meeting-open').forEach((button) => button.onclick = () => { activeId = button.dataset.id; closeSidebarMenus(); closeEditorMenus(); render(); });
  document.querySelector('#new-meeting').onclick = () => {
    const projectId = activeMeeting()?.projectId || store.projects[0].id;
    const meeting = newMeeting(projectId);
    store.meetings.push(meeting);
    store.settings.projectCollapsed[projectId] = false;
    activeId = meeting.id;
    scheduleSave();
    render();
  };
  const update = () => {
    const meeting = activeMeeting();
    refreshOutline();
    meeting.title = document.querySelector('#meeting-title').value || '未命名会议';
    meeting.date = document.querySelector('#meeting-date').value;
    meeting.content = document.querySelector('#editor').innerHTML;
    meeting.updatedAt = Date.now();
    scheduleSave();
  };
  ['meeting-title', 'meeting-date', 'editor'].forEach((id) => document.querySelector(`#${id}`).addEventListener('input', update));
  document.querySelector('#capture').onclick = () => window.minuteMark.openCapture();
  const exportTrigger = document.querySelector('#export-menu-trigger');
  const exportPopover = document.querySelector('.export-popover');
  exportTrigger.onclick = (event) => {
    event.stopPropagation();
    const willOpen = exportPopover.classList.contains('hidden');
    exportPopover.classList.toggle('hidden', !willOpen);
    exportTrigger.setAttribute('aria-expanded', String(willOpen));
  };
  exportPopover.querySelectorAll('[data-export-format]').forEach((button) => button.onclick = async (event) => {
    event.stopPropagation();
    exportPopover.classList.add('hidden');
    exportTrigger.setAttribute('aria-expanded', 'false');
    await exportMeeting(activeId, button.dataset.exportFormat);
  });
  if (!window.__exportPopoverOutsideBound) {
    window.__exportPopoverOutsideBound = true;
    document.addEventListener('click', (event) => {
      if (event.target.closest('.export-wrap')) return;
      document.querySelector('.export-popover')?.classList.add('hidden');
      document.querySelector('#export-menu-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }
  document.querySelector('#app-zoom').onclick = () => setAppZoom(1);
  document.querySelector('#sidebar-toggle').onclick = () => togglePanel('sidebarCollapsed');
  document.querySelector('#outline-toggle').onclick = () => togglePanel('outlineCollapsed');
  document.querySelector('#new-project').onclick = () => projectNameModal();
  document.querySelector('#open-archive').onclick = () => archivedMeetingsModal();
  document.querySelectorAll('[data-project-toggle]').forEach((button) => button.onclick = () => {
    const id = button.dataset.projectToggle;
    store.settings.projectCollapsed[id] = !store.settings.projectCollapsed[id];
    scheduleSave();
    render();
  });
  document.querySelectorAll('[data-meeting-menu]').forEach((button) => button.onclick = (event) => {
    event.stopPropagation();
    showMeetingMenu(button, button.dataset.meetingMenu);
  });
  document.querySelectorAll('[data-project-menu]').forEach((button) => button.onclick = (event) => {
    event.stopPropagation();
    showProjectMenu(button, button.dataset.projectMenu);
  });
  bindMeetingDragAndDrop();
  const aiPopover = document.querySelector('.sidebar-ai-popover');
  document.querySelector('#sidebar-ai-menu').onclick = (event) => { event.stopPropagation(); aiPopover.classList.toggle('hidden'); };
  document.querySelector('#sidebar-paste').onclick = () => { aiPopover.classList.add('hidden'); transcriptModal(); };
  document.querySelector('#sidebar-media').onclick = () => { aiPopover.classList.add('hidden'); importMedia(); };
  document.querySelector('#sidebar-settings').onclick = () => { aiPopover.classList.add('hidden'); settingsModal(); };
  if (!window.__aiPopoverOutsideBound) {
    window.__aiPopoverOutsideBound = true;
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.sidebar-ai-wrap')) document.querySelector('.sidebar-ai-popover')?.classList.add('hidden');
      if (!event.target.closest('.sidebar-context-menu,[data-meeting-menu],[data-project-menu]')) closeSidebarMenus();
    });
  }
  document.querySelectorAll('[data-template]').forEach((button) => button.onclick = () => insertTemplate(button.dataset.template));
  document.querySelector('#extract-actions').onclick = () => transcriptModal(document.querySelector('#editor').innerText, '当前笔记');
  document.querySelector('#focus-mode').onclick = () => enterFocusMode();
  const editor = document.querySelector('#editor');
  if (normalizeEditorStructure(editor)) {
    activeMeeting().content = editor.innerHTML;
    scheduleSave();
  }
  normalizeCustomFontSizes(editor);
  editor.addEventListener('scroll', () => {
    cancelAnimationFrame(outlineUpdateFrame);
    outlineUpdateFrame = requestAnimationFrame(updateActiveOutline);
  });
  if (!window.__appZoomBound) {
    window.__appZoomBound = true;
    document.addEventListener('wheel', (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const current = Number(store.settings.appZoom) || 1;
      setAppZoom(current + (event.deltaY < 0 ? .1 : -.1));
    }, { passive: false, capture: true });
  }
  refreshOutline();
}

function setAppZoom(value) {
  const zoom = Math.min(1.5, Math.max(.6, Math.round(value * 10) / 10));
  store.settings.appZoom = zoom;
  window.minuteMark.setZoomFactor(zoom);
  const indicator = document.querySelector('#app-zoom');
  if (indicator) {
    indicator.textContent = `${Math.round(zoom * 100)}%`;
    indicator.classList.toggle('active', zoom !== 1);
  }
  scheduleSave();
  closeEditorMenus();
}

function normalizeCustomFontSizes(editor) {
  if (!editor) return;
  editor.querySelectorAll('[data-font-size]').forEach((element) => {
    element.style.fontSize = `${Number(element.dataset.fontSize)}px`;
  });
}

function normalizeEditorStructure(editor) {
  let changed = false;
  const isMeaningful = (element) => Boolean(element.textContent.trim() || element.querySelector('img,video,table'));
  const createHeading = (tagName, source, html) => {
    const heading = document.createElement(tagName);
    heading.innerHTML = html;
    heading.style.cssText = source.style.cssText;
    if (source.dataset.fontSize) heading.dataset.fontSize = source.dataset.fontSize;
    return heading;
  };

  [...editor.querySelectorAll('h1,h2,h3,h4')].reverse().forEach((heading) => {
    const hasInvalidChild = [...heading.children].some((child) => child.matches('ol,ul,p,div,h1,h2,h3,h4,blockquote,pre'));
    if (!hasInvalidChild) return;
    const replacements = [];
    const inlineNodes = [];
    const flushInline = () => {
      const holder = document.createElement('span');
      inlineNodes.splice(0).forEach((node) => holder.append(node));
      if (isMeaningful(holder)) replacements.push(createHeading(heading.tagName, heading, holder.innerHTML));
    };
    [...heading.childNodes].forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('ol,ul,p,div,h1,h2,h3,h4,blockquote,pre')) {
        inlineNodes.push(node.cloneNode(true));
        return;
      }
      flushInline();
      if (node.matches('ol,ul')) {
        [...node.children].filter((child) => child.matches('li') && isMeaningful(child)).forEach((item) => replacements.push(createHeading(heading.tagName, heading, item.innerHTML)));
      } else if (node.matches('h1,h2,h3,h4')) {
        if (isMeaningful(node)) replacements.push(node.cloneNode(true));
      } else if (isMeaningful(node)) {
        replacements.push(createHeading(heading.tagName, heading, node.innerHTML));
      }
    });
    flushInline();
    heading.replaceWith(...replacements);
    changed = true;
  });
  return changed;
}

function togglePanel(key) {
  store.settings[key] = !store.settings[key];
  scheduleSave();
  closeEditorMenus();
  render();
}

function closeSidebarMenus() {
  document.querySelectorAll('.sidebar-context-menu').forEach((menu) => menu.remove());
}

function clearDragState() {
  draggingMeetingId = null;
  document.querySelectorAll('.meeting-row.dragging,.project-row.drop-target,.archive-entry.drop-target').forEach((element) => element.classList.remove('dragging', 'drop-target'));
  document.body.classList.remove('meeting-dragging');
}

function bindDropTarget(element, onDrop) {
  element.ondragenter = (event) => {
    if (!draggingMeetingId) return;
    event.preventDefault();
    element.classList.add('drop-target');
  };
  element.ondragover = (event) => {
    if (!draggingMeetingId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    element.classList.add('drop-target');
  };
  element.ondragleave = (event) => {
    if (!event.relatedTarget || !element.contains(event.relatedTarget)) element.classList.remove('drop-target');
  };
  element.ondrop = (event) => {
    event.preventDefault();
    const meetingId = event.dataTransfer?.getData('text/plain') || draggingMeetingId;
    clearDragState();
    if (meetingId) onDrop(meetingId);
  };
}

function bindMeetingDragAndDrop() {
  document.querySelectorAll('.meeting-row[draggable="true"]').forEach((row) => {
    row.ondragstart = (event) => {
      draggingMeetingId = row.dataset.meetingId;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggingMeetingId);
      }
      document.body.classList.add('meeting-dragging');
      requestAnimationFrame(() => row.classList.add('dragging'));
    };
    row.ondragend = clearDragState;
  });
  document.querySelectorAll('[data-project-drop]').forEach((row) => bindDropTarget(row, (meetingId) => {
    const meeting = store.meetings.find((item) => item.id === meetingId && !item.archivedAt);
    const projectId = row.dataset.projectDrop;
    if (!meeting || !store.projects.some((project) => project.id === projectId)) return;
    if (meeting.projectId === projectId) return toast('会议已在该项目中');
    meeting.projectId = projectId;
    meeting.updatedAt = Date.now();
    store.settings.projectCollapsed[projectId] = false;
    scheduleSave();
    render();
    toast('会议已移动到项目');
  }));
  bindDropTarget(document.querySelector('#open-archive'), (meetingId) => archiveMeeting(meetingId));
}

function positionSidebarMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - menu.offsetWidth - 10, rect.right + 7);
  const top = Math.min(window.innerHeight - menu.offsetHeight - 10, rect.top);
  menu.style.left = `${Math.max(10, left)}px`;
  menu.style.top = `${Math.max(10, top)}px`;
}

function showMeetingMenu(anchor, meetingId) {
  closeSidebarMenus();
  const meeting = store.meetings.find((item) => item.id === meetingId);
  if (!meeting) return;
  const menu = document.createElement('div');
  menu.className = 'sidebar-context-menu';
  menu.innerHTML = '<button data-action="rename">重命名</button><button data-action="move">移动到项目</button><button data-action="export">导出纪要</button><hr><button data-action="archive" class="danger-soft">归档会议</button>';
  document.body.append(menu);
  positionSidebarMenu(menu, anchor);
  menu.querySelector('[data-action="rename"]').onclick = () => { closeSidebarMenus(); meetingNameModal(meeting); };
  menu.querySelector('[data-action="move"]').onclick = () => { closeSidebarMenus(); moveMeetingModal(meeting); };
  menu.querySelector('[data-action="export"]').onclick = () => { closeSidebarMenus(); exportFormatModal(meeting); };
  menu.querySelector('[data-action="archive"]').onclick = () => {
    closeSidebarMenus();
    confirmModal('归档会议', `“${meeting.title}”将从项目和最近列表中隐藏，可随时从“已归档”恢复。`, '确认归档', () => archiveMeeting(meeting.id));
  };
}

function showProjectMenu(anchor, projectId) {
  closeSidebarMenus();
  const project = store.projects.find((item) => item.id === projectId);
  if (!project) return;
  const menu = document.createElement('div');
  menu.className = 'sidebar-context-menu';
  menu.innerHTML = '<button data-action="new">在项目中新建会议</button><button data-action="rename">重命名项目</button>';
  document.body.append(menu);
  positionSidebarMenu(menu, anchor);
  menu.querySelector('[data-action="new"]').onclick = () => {
    const meeting = newMeeting(project.id);
    store.meetings.push(meeting);
    store.settings.projectCollapsed[project.id] = false;
    activeId = meeting.id;
    scheduleSave();
    closeSidebarMenus();
    render();
  };
  menu.querySelector('[data-action="rename"]').onclick = () => { closeSidebarMenus(); projectNameModal(project); };
}

function projectNameModal(project = null) {
  const element = modal(`<button class="close">×</button><h2>${project ? '重命名项目' : '新建项目'}</h2><p class="helper">项目用于集中管理同一主题或周期的会议纪要。</p><label>项目名称<input id="project-name" maxlength="40" value="${escapeHtml(project?.name || '')}" placeholder="例如：产品周会"></label><div class="modal-actions"><button class="ghost cancel">取消</button><button class="capture-btn" id="save-project">${project ? '保存' : '创建项目'}</button></div>`);
  const input = element.querySelector('#project-name');
  element.querySelectorAll('.close,.cancel').forEach((button) => button.onclick = () => element.remove());
  const save = () => {
    const name = input.value.trim();
    if (!name) return toast('请输入项目名称');
    if (project) project.name = name;
    else {
      const created = { id: crypto.randomUUID(), name, createdAt: Date.now() };
      store.projects.push(created);
      store.settings.projectCollapsed[created.id] = false;
    }
    scheduleSave();
    element.remove();
    render();
    toast(project ? '项目名称已更新' : '项目已创建');
  };
  element.querySelector('#save-project').onclick = save;
  input.onkeydown = (event) => { if (event.key === 'Enter') save(); };
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function meetingNameModal(meeting) {
  const element = modal(`<button class="close">×</button><h2>重命名会议</h2><label>会议名称<input id="rename-meeting" maxlength="80" value="${escapeHtml(meeting.title)}"></label><div class="modal-actions"><button class="ghost cancel">取消</button><button class="capture-btn" id="save-meeting-name">保存</button></div>`);
  const input = element.querySelector('#rename-meeting');
  element.querySelectorAll('.close,.cancel').forEach((button) => button.onclick = () => element.remove());
  const save = () => {
    meeting.title = input.value.trim() || '未命名会议';
    meeting.updatedAt = Date.now();
    scheduleSave();
    element.remove();
    render();
  };
  element.querySelector('#save-meeting-name').onclick = save;
  input.onkeydown = (event) => { if (event.key === 'Enter') save(); };
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function moveMeetingModal(meeting) {
  const options = store.projects.map((project) => `<option value="${project.id}" ${project.id === meeting.projectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('');
  const element = modal(`<button class="close">×</button><h2>移动到项目</h2><p class="helper">选择“${escapeHtml(meeting.title)}”所属的项目。</p><label>目标项目<select id="target-project">${options}</select></label><div class="modal-actions"><button class="ghost cancel">取消</button><button class="capture-btn" id="move-meeting">移动</button></div>`);
  element.querySelectorAll('.close,.cancel').forEach((button) => button.onclick = () => element.remove());
  element.querySelector('#move-meeting').onclick = () => {
    meeting.projectId = element.querySelector('#target-project').value;
    meeting.updatedAt = Date.now();
    store.settings.projectCollapsed[meeting.projectId] = false;
    scheduleSave();
    element.remove();
    render();
    toast('会议已移动');
  };
}

function confirmModal(title, message, confirmText, onConfirm) {
  const element = modal(`<button class="close">×</button><h2>${escapeHtml(title)}</h2><p class="confirm-copy">${escapeHtml(message)}</p><div class="modal-actions"><button class="ghost cancel">取消</button><button class="capture-btn" id="confirm-action">${escapeHtml(confirmText)}</button></div>`);
  element.querySelectorAll('.close,.cancel').forEach((button) => button.onclick = () => element.remove());
  element.querySelector('#confirm-action').onclick = () => { element.remove(); onConfirm(); };
}

function archiveMeeting(meetingId) {
  const meeting = store.meetings.find((item) => item.id === meetingId);
  if (!meeting) return;
  meeting.archivedAt = Date.now();
  if (activeId === meetingId) activeId = store.meetings.find((item) => !item.archivedAt)?.id || null;
  scheduleSave();
  render();
  toast('会议已归档');
}

function archivedMeetingsModal() {
  const archived = store.meetings.filter((item) => item.archivedAt).sort((a, b) => b.archivedAt - a.archivedAt);
  const rows = archived.length ? archived.map((meeting) => {
    const project = store.projects.find((item) => item.id === meeting.projectId);
    return `<div class="archived-row"><span><strong>${escapeHtml(meeting.title)}</strong><small>${escapeHtml(project?.name || '我的会议')} · ${meeting.date}</small></span><button data-restore="${meeting.id}">恢复</button></div>`;
  }).join('') : '<div class="archive-empty">还没有已归档的会议</div>';
  const element = modal(`<button class="close">×</button><h2>已归档</h2><p class="helper">归档不会删除会议内容，可以随时恢复。</p><div class="archived-list">${rows}</div><div class="modal-actions"><button class="ghost close-bottom">完成</button></div>`);
  element.querySelectorAll('.close,.close-bottom').forEach((button) => button.onclick = () => element.remove());
  element.querySelectorAll('[data-restore]').forEach((button) => button.onclick = () => {
    const meeting = store.meetings.find((item) => item.id === button.dataset.restore);
    if (!meeting) return;
    meeting.archivedAt = null;
    meeting.updatedAt = Date.now();
    store.settings.projectCollapsed[meeting.projectId] = false;
    activeId = meeting.id;
    scheduleSave();
    element.remove();
    render();
    toast('会议已恢复');
  });
}

function refreshOutline() {
  const editor = document.querySelector('#editor');
  const list = document.querySelector('#outline-list');
  if (!editor || !list) return;
  const entries = [];
  [...editor.querySelectorAll('h1,h2,h3,h4')]
    .filter((heading) => !heading.parentElement?.closest('h1,h2,h3,h4'))
    .forEach((heading) => {
      const level = Number(heading.tagName.slice(1));
      const listItems = [...heading.querySelectorAll(':scope > ol > li, :scope > ul > li')];
      const targets = listItems.length ? listItems : [heading];
      targets.filter((target) => target.textContent.trim()).forEach((target) => {
        if (!target.dataset.outlineId) target.dataset.outlineId = `outline-${activeId}-${++outlineSequence}`;
        entries.push({ target, level, text: target.textContent.trim() });
      });
    });
  if (!entries.length) {
    list.innerHTML = '<p class="outline-empty">添加标题后，将在这里生成目录</p>';
    return;
  }
  list.innerHTML = entries.map(({ target, level, text }) => {
    return `<button class="outline-item level-${level}" data-target="${target.dataset.outlineId}" title="${escapeHtml(text)}"><span>${escapeHtml(text)}</span></button>`;
  }).join('');
  list.querySelectorAll('.outline-item').forEach((button) => {
    button.onclick = () => {
      const target = [...editor.querySelectorAll('[data-outline-id]')].find((element) => element.dataset.outlineId === button.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      list.querySelectorAll('.outline-item').forEach((item) => item.classList.toggle('active', item === button));
      target.classList.remove('outline-flash');
      requestAnimationFrame(() => target.classList.add('outline-flash'));
      setTimeout(() => target.classList.remove('outline-flash'), 1200);
    };
  });
  updateActiveOutline();
}

function updateActiveOutline() {
  const editor = document.querySelector('#editor');
  const list = document.querySelector('#outline-list');
  if (!editor || !list) return;
  const buttons = [...list.querySelectorAll('.outline-item')];
  const targets = buttons.map((button) => [...editor.querySelectorAll('[data-outline-id]')].find((element) => element.dataset.outlineId === button.dataset.target)).filter(Boolean);
  if (!targets.length) return;
  const editorTop = editor.getBoundingClientRect().top;
  let current = targets[0];
  for (const target of targets) {
    if (target.getBoundingClientRect().top <= editorTop + 96) current = target;
    else break;
  }
  buttons.forEach((button) => {
    const active = button.dataset.target === current.dataset.outlineId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  });
}

function modal(body) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal">${body}</section>`;
  document.body.append(backdrop);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.remove(); });
  return backdrop;
}

async function settingsModal() {
  const settings = { ...defaultSettings, ...store.settings };
  const keyStatus = await window.minuteMark.cloudApiKeyStatus();
  const keyHint = !keyStatus.available ? '当前系统不支持安全存储，无法保存 API Key。' : keyStatus.configured ? '已安全保存；留空将保留当前 Key，输入新值可替换。' : '尚未保存；Key 将使用系统安全存储加密保存。';
  const element = modal(`<button class="close">×</button><h2>智能功能设置</h2><p class="helper">纪要生成只需填写云端 API 地址和 API Key；默认使用 gpt-4.1-mini。音频和视频均在本机转写，视频会先由 FFmpeg 提取为 WAV，再交给本地 Whisper。</p><label>云端 API 地址<input id="cloud-url" value="${escapeHtml(settings.cloudApiUrl)}" placeholder="https://api.openai.com/v1"></label><label>云端 API Key<input id="cloud-key" type="password" autocomplete="off" placeholder="${keyStatus.configured ? '已保存，留空则不变' : '请输入 API Key'}"></label><p class="helper">${keyHint}</p><hr><label>本地 Whisper 转写程序路径<input id="whisper" value="${escapeHtml(settings.whisperPath)}"></label><label>本地 Whisper 模型路径<input id="whisper-model" value="${escapeHtml(settings.whisperModel)}"></label><label>FFmpeg 路径（MP3、M4A 和视频需要）<input id="ffmpeg" value="${escapeHtml(settings.ffmpegPath)}"></label><div class="modal-actions"><button class="ghost cancel">取消</button><button class="capture-btn" id="save-settings">保存</button></div>`);
  element.querySelectorAll('.close,.cancel').forEach((button) => button.onclick = () => element.remove());
  element.querySelector('#save-settings').onclick = async () => {
    const button = element.querySelector('#save-settings');
    const key = element.querySelector('#cloud-key').value;
    button.disabled = true;
    if (key) {
      const result = await window.minuteMark.saveCloudApiKey(key);
      if (!result.ok) { button.disabled = false; return toast(result.error); }
    }
    store.settings = { ...store.settings, cloudApiUrl: element.querySelector('#cloud-url').value.trim(), whisperPath: element.querySelector('#whisper').value.trim(), whisperModel: element.querySelector('#whisper-model').value.trim(), ffmpegPath: element.querySelector('#ffmpeg').value.trim() };
    delete store.settings.cloudModel;
    scheduleSave(); element.remove(); toast('智能功能设置已保存');
  };
}

function transcriptModal(text = '', source = '') {
  const element = modal(`<button class="close">×</button><h2>${source ? '确认逐字稿' : '粘贴对话记录'}</h2><p class="helper">${source ? `已从 ${escapeHtml(source)} 读取文本，可编辑后生成。` : '输入会议聊天记录、转写稿或手工记录。'}</p><textarea id="transcript">${escapeHtml(text)}</textarea><div class="modal-actions"><button class="ghost cancel">取消</button><button class="capture-btn" id="generate">生成会议纪要</button></div>`);
  element.querySelectorAll('.close,.cancel').forEach((button) => button.onclick = () => element.remove());
  element.querySelector('#generate').onclick = async () => {
    const transcript = element.querySelector('#transcript').value.trim();
    if (!transcript) return toast('请先输入会议记录');
    const button = element.querySelector('#generate'); button.disabled = true; button.textContent = '云端模型正在整理…';
    const result = await window.minuteMark.summarize({ transcript, title: activeMeeting().title, settings: { ...defaultSettings, ...store.settings } });
    if (!result.ok) { button.disabled = false; button.textContent = '生成会议纪要'; return toast(result.error); }
    insertAi(result.markdown); element.remove(); toast('智能纪要已插入编辑器');
  };
}

async function importMedia() {
  const file = await window.minuteMark.pickMedia();
  if (!file) return;
  const extension = file.split('.').pop().toLowerCase();
  const videoExtensions = new Set(['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'mpeg', 'mpg']);
  toast(videoExtensions.has(extension) ? '正在从视频提取音频并使用本地模型转写…' : '正在使用本地语音识别模型转写…');
  const result = await window.minuteMark.transcribe({ audioPath: file, settings: { ...defaultSettings, ...store.settings } });
  if (!result.ok) return toast(result.error);
  transcriptModal(result.transcript, file.split(/[\\/]/).pop());
}

function insertAi(markdown) {
  const html = escapeHtml(markdown).replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>').replace(/\n/g, '<br>');
  const editor = document.querySelector('#editor'); editor.focus(); document.execCommand('insertHTML', false, `<hr><section class="ai-result">${html}</section>`); editor.dispatchEvent(new InputEvent('input'));
}

function insertTemplate(kind) {
  const templates = { summary: '<h2>会议摘要</h2><p></p>', decision: '<h2>决议</h2><ul><li></li></ul>', action: '<h2>行动项</h2><ul><li>事项：　负责人：　截止时间：</li></ul>', risk: '<h2>风险与待确认事项</h2><ul><li></li></ul>' };
  const editor = document.querySelector('#editor'); editor.focus(); document.execCommand('insertHTML', false, templates[kind]); editor.dispatchEvent(new InputEvent('input'));
}

async function exportMeeting(meetingId = activeId, format = 'md') {
  const meeting = store.meetings.find((item) => item.id === meetingId);
  if (!meeting) return;
  const editor = meeting.id === activeId ? document.querySelector('#editor') : null;
  const holder = document.createElement('div');
  holder.innerHTML = editor ? editor.innerHTML : meeting.content;
  const html = holder.innerHTML;
  const plainText = holder.innerText || holder.textContent || '';
  const markdown = `# ${meeting.title}\n\n日期：${meeting.date}\n\n${plainText.trim()}\n`;
  const result = await window.minuteMark.exportDocument({ format, title: meeting.title, date: meeting.date, html, markdown });
  if (!result.ok) return toast(result.error);
  if (!result.canceled) toast(`${format === 'pdf' ? 'PDF' : format === 'word' ? 'Word' : 'MD'} 纪要已导出`);
}

function exportFormatModal(meeting) {
  const element = modal(`<button class="close">×</button><h2>导出纪要</h2><p class="helper">选择“${escapeHtml(meeting.title)}”的导出格式。</p><div class="export-format-list"><button data-modal-export="pdf"><b>PDF 文档</b><span>适合打印和分享</span></button><button data-modal-export="word"><b>Word 文档</b><span>可继续编辑</span></button><button data-modal-export="md"><b>MD 文件</b><span>纯文本格式</span></button></div>`);
  element.querySelector('.close').onclick = () => element.remove();
  element.querySelectorAll('[data-modal-export]').forEach((button) => button.onclick = async () => {
    element.remove();
    await exportMeeting(meeting.id, button.dataset.modalExport);
  });
}

function enterFocusMode() {
  document.body.classList.add('focus-mode');
  let bar = document.querySelector('.focus-bar');
  if (!bar) { bar = document.createElement('div'); bar.className = 'focus-bar'; bar.innerHTML = '<span><b>专注模式</b><small>仅保留纪要编辑区</small></span><div><button id="focus-capture">▣ 截图标注</button><button id="focus-exit">退出专注模式</button></div>'; document.body.append(bar); }
  bar.querySelector('#focus-capture').onclick = () => window.minuteMark.openCapture();
  bar.querySelector('#focus-exit').onclick = () => document.body.classList.remove('focus-mode');
}

// One selection controller owns all rich-text menus. No hover handles and no competing listeners.
let savedRange = null;
let selectionRect = null;

function closeEditorMenus() {
  document.querySelectorAll('.selection-toolbar,.selection-title-menu,.selection-font-menu,.selection-line-menu,.selection-more-panel,.selection-align-menu').forEach((element) => element.remove());
}

function restoreSelection() {
  if (!savedRange) return false;
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); return true;
}

function placePopup(element, rect, preferred = 'below') {
  const gap = 7;
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  let left = rect.left;
  if (left + width > window.innerWidth - 10) left = rect.right - width;
  left = Math.max(10, left);
  const canBelow = rect.bottom + gap + height <= window.innerHeight - 10;
  let top = preferred === 'below' && canBelow ? rect.bottom + gap : rect.top - height - gap;
  if (top < 10) top = Math.min(window.innerHeight - height - 10, rect.bottom + gap);
  element.style.left = `${left}px`; element.style.top = `${top}px`;
}

function runCommand(command, value = null, keepOpen = false) {
  if (!restoreSelection()) return;
  document.execCommand(command, false, value);
  const editor = document.querySelector('#editor');
  if (command === 'formatBlock') normalizeEditorStructure(editor);
  editor?.dispatchEvent(new InputEvent('input'));
  if (!keepOpen) closeEditorMenus();
}

function selectedFontSize() {
  if (!savedRange) return 16;
  const node = savedRange.startContainer.nodeType === Node.ELEMENT_NODE ? savedRange.startContainer : savedRange.startContainer.parentElement;
  const explicit = node.closest?.('[data-font-size]');
  if (explicit) return Number(explicit.dataset.fontSize) || 16;
  return Math.round(parseFloat(getComputedStyle(node).fontSize)) || 16;
}

function applyFontSize(size) {
  if (!restoreSelection()) return;
  const editor = document.querySelector('#editor');
  document.execCommand('fontSize', false, '7');
  editor.querySelectorAll('font[size="7"]').forEach((font) => {
    font.removeAttribute('size');
    font.dataset.fontSize = String(size);
    font.style.fontSize = `${size}px`;
  });
  editor.dispatchEvent(new InputEvent('input'));
  closeEditorMenus();
}

function selectedLineHeight() {
  if (!savedRange) return 1.75;
  const node = savedRange.startContainer.nodeType === Node.ELEMENT_NODE ? savedRange.startContainer : savedRange.startContainer.parentElement;
  const style = getComputedStyle(node);
  const value = parseFloat(style.lineHeight) / parseFloat(style.fontSize);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 1.75;
}

function applyLineHeight(value) {
  if (!restoreSelection()) return;
  const editor = document.querySelector('#editor');
  const blocks = [...editor.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,pre')].filter((block) => {
    try { return savedRange.intersectsNode(block); } catch { return false; }
  });
  if (!blocks.length) {
    const node = savedRange.startContainer.nodeType === Node.ELEMENT_NODE ? savedRange.startContainer : savedRange.startContainer.parentElement;
    const block = node.closest('p,h1,h2,h3,h4,li,blockquote,pre,section,div');
    if (block && editor.contains(block)) blocks.push(block);
  }
  blocks.forEach((block) => { block.style.lineHeight = String(value); });
  editor.dispatchEvent(new InputEvent('input'));
  closeEditorMenus();
}

function showSelectionToolbar() {
  const editor = document.querySelector('#editor');
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount || selection.isCollapsed) return closeEditorMenus();
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return closeEditorMenus();
  savedRange = range.cloneRange();
  selectionRect = range.getBoundingClientRect();
  closeEditorMenus();

  const toolbar = document.createElement('div');
  toolbar.className = 'selection-toolbar';
  toolbar.innerHTML = `<button data-title-trigger title="正文与标题">格式⌄</button><button data-font-trigger title="字号">${selectedFontSize()}⌄</button><button data-line-trigger title="行间距">↕${selectedLineHeight()}</button><button data-command="bold" title="粗体"><b>粗</b></button><button data-command="italic" title="斜体"><i>斜</i></button><button data-command="underline" title="下划线"><u>下</u></button><button data-command="strikeThrough" title="删除线"><s>删</s></button><button data-color title="文字颜色">色⌄</button><span></span><button data-command="insertUnorderedList" title="无序列表">☷</button><button data-command="insertOrderedList" title="有序列表">1☷</button><button data-more-trigger title="更多">•••</button>`;
  document.body.append(toolbar);
  placePopup(toolbar, selectionRect);

  toolbar.querySelectorAll('[data-command]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); runCommand(button.dataset.command); });
  const titleTrigger = toolbar.querySelector('[data-title-trigger]');
  titleTrigger.onmousedown = (event) => event.preventDefault();
  titleTrigger.onclick = (event) => { event.preventDefault(); event.stopPropagation(); showTitleMenu(titleTrigger); };
  const fontTrigger = toolbar.querySelector('[data-font-trigger]');
  fontTrigger.onmousedown = (event) => event.preventDefault();
  fontTrigger.onclick = (event) => { event.preventDefault(); event.stopPropagation(); showFontSizeMenu(fontTrigger); };
  const lineTrigger = toolbar.querySelector('[data-line-trigger]');
  lineTrigger.onmousedown = (event) => event.preventDefault();
  lineTrigger.onclick = (event) => { event.preventDefault(); event.stopPropagation(); showLineHeightMenu(lineTrigger); };
  const moreTrigger = toolbar.querySelector('[data-more-trigger]');
  moreTrigger.onmousedown = (event) => event.preventDefault();
  moreTrigger.onclick = (event) => { event.preventDefault(); event.stopPropagation(); showMorePanel(toolbar.getBoundingClientRect()); };
  toolbar.querySelector('[data-color]').onmousedown = (event) => { event.preventDefault(); const picker = document.createElement('input'); picker.type = 'color'; picker.value = '#111111'; picker.oninput = () => runCommand('foreColor', picker.value); picker.click(); };
}

function showFontSizeMenu(trigger) {
  document.querySelector('.selection-font-menu')?.remove();
  document.querySelector('.selection-line-menu')?.remove();
  document.querySelector('.selection-title-menu')?.remove();
  const current = selectedFontSize();
  const sizes = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40];
  const menu = document.createElement('div');
  menu.className = 'selection-font-menu';
  menu.innerHTML = `<div class="font-menu-head">字号</div>${sizes.map((size) => `<button data-size="${size}" class="${size === current ? 'active' : ''}"><span style="font-size:${Math.min(size, 22)}px">${size}</span><i>${size === current ? '✓' : ''}</i></button>`).join('')}`;
  document.body.append(menu);
  const rect = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 10))}px`;
  menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, rect.bottom + 6)}px`;
  menu.querySelectorAll('[data-size]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); applyFontSize(Number(button.dataset.size)); });
}

function showLineHeightMenu(trigger) {
  document.querySelector('.selection-line-menu')?.remove();
  document.querySelector('.selection-font-menu')?.remove();
  document.querySelector('.selection-title-menu')?.remove();
  const current = selectedLineHeight();
  const options = [{ value: 1, label: '紧凑' }, { value: 1.15, label: '较紧凑' }, { value: 1.5, label: '标准' }, { value: 1.75, label: '舒适' }, { value: 2, label: '宽松' }, { value: 2.5, label: '超宽' }];
  const menu = document.createElement('div');
  menu.className = 'selection-line-menu';
  menu.innerHTML = `<div class="font-menu-head">行间距</div>${options.map((option) => `<button data-line="${option.value}" class="${Math.abs(option.value - current) < .03 ? 'active' : ''}"><span>${option.label}</span><small>${option.value}</small><i>${Math.abs(option.value - current) < .03 ? '✓' : ''}</i></button>`).join('')}`;
  document.body.append(menu);
  const rect = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 10))}px`;
  menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, rect.bottom + 6)}px`;
  menu.querySelectorAll('[data-line]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); applyLineHeight(Number(button.dataset.line)); });
}

function showTitleMenu(trigger) {
  document.querySelector('.selection-title-menu')?.remove();
  document.querySelector('.selection-font-menu')?.remove();
  document.querySelector('.selection-line-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'selection-title-menu';
  menu.innerHTML = '<button data-block="p"><b>文</b><span>正文</span><i>✓</i></button><button data-block="h1"><b>一</b><span>一级标题</span></button><button data-block="h2"><b>二</b><span>二级标题</span></button><button data-block="h3"><b>三</b><span>三级标题</span></button><button data-block="h4"><b>他</b><span>其他标题</span></button>';
  document.body.append(menu);
  const rect = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 10))}px`;
  menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, rect.bottom + 6)}px`;
  menu.querySelectorAll('[data-block]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); runCommand('formatBlock', button.dataset.block); });
}

function showMorePanel(toolbarRect) {
  document.querySelector('.selection-toolbar')?.remove();
  document.querySelector('.selection-title-menu')?.remove();
  const panel = document.createElement('div');
  panel.className = 'selection-more-panel';
  panel.innerHTML = '<div class="more-grid"><button data-command="formatBlock" data-value="p" title="正文">文</button><button data-command="formatBlock" data-value="h1" title="一级标题">一</button><button data-command="formatBlock" data-value="h2" title="二级标题">二</button><button data-command="formatBlock" data-value="h3" title="三级标题">三</button><button data-command="insertOrderedList" title="有序列表">1☷</button><button data-command="insertUnorderedList" title="无序列表">•☷</button><button data-task title="待办事项">☑</button><button data-code title="代码块">{ }</button><button data-command="formatBlock" data-value="blockquote" title="引用">❝</button><button data-command="insertHorizontalRule" title="分隔线">━</button><button data-align-trigger title="缩进和对齐">☰</button><button data-command="copy" title="复制">⧉</button></div><div class="more-actions"><button data-align-trigger>☰　缩进和对齐 <i>›</i></button><button data-color>◉　颜色 <i>›</i></button><button data-command="cut">✂　剪切</button><button data-command="copy">⧉　复制</button><button data-command="delete">⌫　删除</button></div>';
  document.body.append(panel);
  placePopup(panel, selectionRect || toolbarRect);
  panel.querySelectorAll('[data-command]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); runCommand(button.dataset.command, button.dataset.value || null); });
  panel.querySelector('[data-task]').onmousedown = (event) => { event.preventDefault(); runCommand('insertHTML', '<div class="task-line">☐ 待办事项</div>'); };
  panel.querySelector('[data-code]').onmousedown = (event) => { event.preventDefault(); runCommand('insertHTML', '<pre><code>在此输入代码或命令</code></pre>'); };
  panel.querySelectorAll('[data-align-trigger]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); showAlignMenu(panel); });
  panel.querySelector('[data-color]').onmousedown = (event) => { event.preventDefault(); const picker = document.createElement('input'); picker.type = 'color'; picker.value = '#111111'; picker.oninput = () => runCommand('foreColor', picker.value); picker.click(); };
}

function showAlignMenu(panel) {
  document.querySelector('.selection-align-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'selection-align-menu';
  menu.innerHTML = '<button data-command="justifyLeft">≡　左对齐</button><button data-command="justifyCenter">≡　居中对齐</button><button data-command="justifyRight">≡　右对齐</button><hr><button data-command="indent">→|　增加缩进</button><button data-command="outdent">|←　减少缩进</button>';
  document.body.append(menu);
  const rect = panel.getBoundingClientRect();
  menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 10, rect.right + 6)}px`;
  menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, rect.top + 80)}px`;
  menu.querySelectorAll('[data-command]').forEach((button) => button.onmousedown = (event) => { event.preventDefault(); runCommand(button.dataset.command); });
}

document.addEventListener('mouseup', (event) => {
  if (event.target.closest('.selection-toolbar,.selection-title-menu,.selection-font-menu,.selection-line-menu,.selection-more-panel,.selection-align-menu')) return;
  if (event.target.closest('#editor')) setTimeout(showSelectionToolbar, 0);
});
document.addEventListener('keyup', (event) => { if (event.target.closest('#editor')) setTimeout(showSelectionToolbar, 0); });
document.addEventListener('mousedown', (event) => { if (!event.target.closest('#editor,.selection-toolbar,.selection-title-menu,.selection-font-menu,.selection-line-menu,.selection-more-panel,.selection-align-menu')) closeEditorMenus(); });
window.addEventListener('resize', closeEditorMenus);
document.addEventListener('scroll', closeEditorMenus, true);

window.minuteMark.onCaptureInserted((dataUrl) => {
  const editor = document.querySelector('#editor');
  if (!editor) return;
  editor.focus(); document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="会议截图">`); editor.dispatchEvent(new InputEvent('input')); toast('截图已插入会议纪要');
});

(async () => {
  store = await window.minuteMark.loadStore();
  const savedZoom = Number(store.settings?.appZoom ?? store.settings?.editorZoom ?? 1) || 1;
  store.settings = { ...defaultSettings, ...store.settings, appZoom: Math.min(1.5, Math.max(.6, savedZoom)) };
  delete store.settings.editorZoom;
  ensureStoreShape();
  window.minuteMark.setZoomFactor(store.settings.appZoom);
  await window.minuteMark.saveStore(store);
  render();
})();
