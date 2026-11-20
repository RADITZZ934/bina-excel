/**
 * Bina Excel Web - Unified Controller:
 * 1. 2-Step Login (NIK & Password) via drive.braminnovation.com (/api/v4/session/token)
 * 2. Beranda (Workspace Dashboard) matching mockup 1:1
 * 3. Multi-Tenant Cloud Storage Integration (bina://my/ and bina://groups)
 * 4. Seamless Canvas WASM Editor Switching
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    TOKEN: 'bina_auth_token',
    USER: 'bina_auth_user',
    SAVED_NIK: 'bina_saved_nik',
    GC_PREFS: 'gridcraft.prefs'
  };

  let elements = {};
  let currentStep = 'nik';
  let isTransitioning = false;
  let allFiles = []; // cached list of cloud files & groups
  let isEditorActive = false;
  let currentOwnerFilter = 'mine'; // 'mine' (default) | 'shared'

  function extractUserInfo(user) {
    if (!user || typeof user !== 'object') user = {};
    let nik = (user.nik || localStorage.getItem(STORAGE_KEYS.SAVED_NIK) || '').toString().trim();
    let rawNama = user.nama || user.nickname || user.nama_lengkap || user.usr_nama || '';
    if (!rawNama && nik) {
      rawNama = 'Karyawan ' + (nik.length > 4 ? nik.slice(-4) : nik);
    } else if (!rawNama) {
      rawNama = 'Karyawan Bina';
    }
    let cleanNama = rawNama.replace(/\s*\(\d+\)/, '').trim();
    return {
      nik: nik,
      nama: cleanNama,
      avatar: user.avatar || '',
      id: user.id || ''
    };
  }

  function syncAuthorToGridCraft(authorName) {
    if (!authorName) return;
    try {
      let prefs = {};
      const raw = localStorage.getItem(STORAGE_KEYS.GC_PREFS);
      if (raw) prefs = JSON.parse(raw);
      prefs.user_name = authorName;
      localStorage.setItem(STORAGE_KEYS.GC_PREFS, JSON.stringify(prefs));
    } catch (e) {}
  }

  function loadUserAvatarTexture(avatarUrl, nik) {
    if (!avatarUrl && !nik) return;
    const finalUrl = avatarUrl || `/api/user-photo/${encodeURIComponent(nik)}`;

    // 1. Try local cached base64
    try {
      const cached = localStorage.getItem('bina_avatar_png_' + nik);
      if (cached) {
        const bin = atob(cached);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        window.__bina_avatar_bytes = bytes;
      }
    } catch (e) {}

    // 2. Fetch fresh image and generate circular PNG for WASM
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const minDim = Math.min(natW, natH);
        const sx = (natW - minDim) / 2;
        const sy = (natH - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        canvas.toBlob(blob => {
          if (!blob) return;
          blob.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            window.__bina_avatar_bytes = bytes;
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            try {
              localStorage.setItem('bina_avatar_png_' + nik, btoa(binary));
            } catch (e) {}
          });
        }, 'image/png');
      } catch (err) {}
    };
    img.src = finalUrl;
  }

  function syncUserToWasm(user) {
    if (!user) return;
    const info = extractUserInfo(user);
    if (!info.nik && !info.nama) return;

    window.__bina_user = {
      nik: info.nik,
      nama: info.nama
    };

    syncAuthorToGridCraft(info.nik ? `${info.nama} • ${info.nik}` : info.nama);
    loadUserAvatarTexture(info.avatar, info.nik);
  }

  // Pre-seed window.__bina_user immediately
  try {
    const rawUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (rawUser) {
      syncUserToWasm(JSON.parse(rawUser));
    }
  } catch (e) {}

  function initElements() {
    elements = {
      body: document.body,
      loginModal: document.getElementById('bina_login_modal'),
      dashboard: document.getElementById('bina_dashboard'),
      editorBackBtn: document.getElementById('bina_editor_back_btn'),

      // Login Step Cards
      stepNik: document.getElementById('step_nik'),
      stepPassword: document.getElementById('step_password'),
      nikInput: document.getElementById('bina_nik'),
      passwordInput: document.getElementById('bina_password'),
      btnNextNik: document.getElementById('btn_next_nik'),
      btnSubmitLogin: document.getElementById('btn_submit_login'),
      btnBackToNik: document.getElementById('btn_back_to_nik'),
      btnGoogleLogin: document.getElementById('btn_google_login'),
      pwArrowIcon: document.getElementById('pw_arrow_icon'),
      pwSpinner: document.getElementById('pw_spinner'),
      errorContainer: document.getElementById('login_error_msg'),
      errorText: document.getElementById('login_error_text'),

      // Dashboard Elements
      searchInput: document.getElementById('dash_search_input'),
      avatarBtn: document.getElementById('dash_user_avatar_btn'),
      avatarImg: document.getElementById('dash_user_avatar_img'),
      avatarFallback: document.getElementById('dash_user_avatar_fallback'),
      popover: document.getElementById('dash_user_popover'),
      popoverAvatarImg: document.getElementById('popover_avatar_img'),
      popoverAvatarFallback: document.getElementById('popover_avatar_fallback'),
      popoverUserName: document.getElementById('popover_user_name'),
      popoverUserNik: document.getElementById('popover_user_nik'),
      popoverLogoutBtn: document.getElementById('dash_btn_logout'),
      btnCreateWorkspace: document.getElementById('btn_create_workspace'),
      filesList: document.getElementById('dash_files_list'),
      filesLoading: document.getElementById('dash_files_loading'),
      filesEmpty: document.getElementById('dash_files_empty'),
      btnOpenLocalFile: document.getElementById('btn_open_local_file'),
      filterOwnerBtn: document.getElementById('filter_owner_dropdown'),
      filterOwnerLabel: document.getElementById('filter_owner_label'),
      filterOwnerPopover: document.getElementById('filter_owner_popover')
    };
  }

  function getStoredAuth() {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const userStr = localStorage.getItem(STORAGE_KEYS.USER);
      const user = userStr ? JSON.parse(userStr) : null;
      return { token, user };
    } catch (e) {
      return { token: null, user: null };
    }
  }

  function setStoredAuth(token, user) {
    try {
      if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      else localStorage.removeItem(STORAGE_KEYS.TOKEN);

      if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      else localStorage.removeItem(STORAGE_KEYS.USER);
    } catch (e) {}
  }

  function hideError() {
    if (elements.errorContainer) elements.errorContainer.style.display = 'none';
  }

  function showError(msg) {
    if (elements.errorContainer && elements.errorText) {
      elements.errorText.textContent = msg || 'NIK atau kata sandi tidak sesuai';
      elements.errorContainer.style.display = 'block';
    }
  }

  function transitionTo(targetStep) {
    if (isTransitioning || currentStep === targetStep) return;
    isTransitioning = true;
    hideError();

    const fromEl = currentStep === 'nik' ? elements.stepNik : elements.stepPassword;
    const toEl = targetStep === 'nik' ? elements.stepNik : elements.stepPassword;
    const isForward = targetStep === 'password';

    fromEl.classList.remove('active');
    fromEl.classList.add(isForward ? 'slide-exit-left' : 'slide-exit-right');

    toEl.classList.remove('active', 'slide-exit-left', 'slide-exit-right');
    if (!isForward) toEl.classList.add('slide-enter-left');
    void toEl.offsetWidth;

    toEl.classList.remove('slide-enter-left');
    toEl.classList.add('active');

    setTimeout(() => {
      if (targetStep === 'password' && elements.passwordInput) elements.passwordInput.focus();
      else if (targetStep === 'nik' && elements.nikInput) {
        elements.nikInput.focus();
        elements.nikInput.select();
      }
    }, 150);

    setTimeout(() => {
      fromEl.classList.remove('slide-exit-left', 'slide-exit-right');
      currentStep = targetStep;
      isTransitioning = false;
    }, 360);
  }

  function setSubmitting(isSubmitting) {
    if (elements.btnSubmitLogin) elements.btnSubmitLogin.disabled = isSubmitting;
    if (elements.pwArrowIcon) elements.pwArrowIcon.style.display = isSubmitting ? 'none' : 'block';
    if (elements.pwSpinner) elements.pwSpinner.style.display = isSubmitting ? 'block' : 'none';
  }

  /* ==================== CLOUD API CALLS (BRAM INNOVATION DRIVE) ==================== */

  async function apiLogin(nik, password) {
    const res = await fetch('/api/v4/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ email: nik, password: password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code !== 0 && data.code !== undefined && data.code !== 200)) {
      const err = new Error(data.msg || data.message || `Login gagal (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data.data || data;
  }

  async function apiFetchFileList(uri) {
    const { token } = getStoredAuth();
    if (!token) return [];

    const url = `/api/v4/file?uri=${encodeURIComponent(uri)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    return (json.data && json.data.files) ? json.data.files : [];
  }

  async function apiGetFileDownloadUrl(fileUri) {
    const { token } = getStoredAuth();
    if (!token) throw new Error('Otentikasi dibutuhkan');

    const res = await fetch('/api/v4/file/url', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ uris: [fileUri], download: false })
    });

    const json = await res.json().catch(() => ({}));
    if (json.data && json.data.urls && json.data.urls[0]) {
      return json.data.urls[0].url;
    }
    throw new Error('Gagal mendapatkan tautan berkas');
  }

  /* ==================== DASHBOARD CONTROLLER ==================== */

  function updateDashboardProfile(user) {
    if (!user) return;
    const info = extractUserInfo(user);
    const initial = (info.nama || 'K').charAt(0).toUpperCase();

    if (elements.popoverUserName) elements.popoverUserName.textContent = info.nama;
    if (elements.popoverUserNik) elements.popoverUserNik.textContent = `NIK: ${info.nik}`;

    if (info.avatar) {
      if (elements.avatarImg) {
        elements.avatarImg.src = info.avatar;
        elements.avatarImg.style.display = 'block';
      }
      if (elements.avatarFallback) elements.avatarFallback.style.display = 'none';

      if (elements.popoverAvatarImg) {
        elements.popoverAvatarImg.src = info.avatar;
        elements.popoverAvatarImg.style.display = 'block';
      }
      if (elements.popoverAvatarFallback) elements.popoverAvatarFallback.style.display = 'none';
    } else {
      if (elements.avatarImg) elements.avatarImg.style.display = 'none';
      if (elements.avatarFallback) {
        elements.avatarFallback.textContent = initial;
        elements.avatarFallback.style.display = 'block';
      }
      if (elements.popoverAvatarImg) elements.popoverAvatarImg.style.display = 'none';
      if (elements.popoverAvatarFallback) {
        elements.popoverAvatarFallback.textContent = initial;
        elements.popoverAvatarFallback.style.display = 'block';
      }
    }
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '16.35';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '16.35';
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}.${mm}`;
      }
      const day = d.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${day} ${months[d.getMonth()]}`;
    } catch (e) {
      return '16.35';
    }
  }

  function renderFileList(items) {
    if (!elements.filesList) return;
    elements.filesList.innerHTML = '';

    if (!items || items.length === 0) {
      if (elements.filesEmpty) elements.filesEmpty.style.display = 'block';
      return;
    }
    if (elements.filesEmpty) elements.filesEmpty.style.display = 'none';

    items.forEach(file => {
      const isGroup = file.type === 1 || file.path?.startsWith('bina://groups');
      const isShared = !file.isMine || file.isShared || isGroup;
      const fileName = file.name || 'Workspace';
      const ownerDisplay = file.isMine ? 'Saya' : (file.ownerName || file.owner?.name || '--');
      const dateText = formatDisplayDate(file.updated_at || file.created_at);

      const row = document.createElement('div');
      row.className = 'file-row-item';
      row.setAttribute('data-path', file.path);
      row.setAttribute('data-name', fileName);
      row.setAttribute('data-type', file.type);

      row.innerHTML = `
        <div class="col-title">
          <img src="bina-excel-app-icon.png" alt="Excel" class="file-type-icon" />
          <span class="file-name" title="${fileName}">${fileName}</span>
          ${isShared ? `
            <span class="file-shared-badge" title="${file.source === 'group' ? 'Grup Kolaborasi' : 'Dibagikan'}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
          ` : ''}
        </div>
        <div class="col-owner">${ownerDisplay}</div>
        <div class="col-date">${dateText}</div>
        <div class="col-action">
          <button class="btn-more-action" title="Menu Opsi">⋮</button>
        </div>
      `;

      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-more-action')) {
          e.stopPropagation();
          alert(`Opsi untuk ${fileName}:\n• Buka\n• Unduh .xlsx\n• Ganti Nama\n• Hapus`);
          return;
        }
        handleOpenFileOrFolder(file);
      });

      elements.filesList.appendChild(row);
    });
  }

  function applyFilterAndRender() {
    let filtered = allFiles;
    if (currentOwnerFilter === 'mine') {
      filtered = filtered.filter(f => f.isMine);
    } else if (currentOwnerFilter === 'shared') {
      filtered = filtered.filter(f => !f.isMine);
    }
    const q = (elements.searchInput?.value || '').toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(f => (f.name || '').toLowerCase().includes(q));
    }
    renderFileList(filtered);
  }

  async function loadDashboardFiles() {
    if (!elements.filesList) return;
    if (elements.filesLoading) elements.filesLoading.style.display = 'flex';
    if (elements.filesEmpty) elements.filesEmpty.style.display = 'none';

    try {
      // 1. Fetch in parallel:
      // - bina://my/ (Milik pribadi user)
      // - bina://groups (Grup Toko / Departemen yang di-assign ke user)
      // - bina://shared_with_me (File/folder yang dibagikan rekan kerja ke user)
      const [myFiles, groups, sharedFiles] = await Promise.all([
        apiFetchFileList('bina://my/').catch(() => []),
        apiFetchFileList('bina://groups').catch(() => []),
        apiFetchFileList('bina://shared_with_me').catch(() => [])
      ]);

      const SPREADSHEET_EXTS = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.tsv', '.ods'];
      function isRelevantItem(item) {
        if (item.type === 1) return true; // Folder & grup selalu relevan
        const lower = (item.name || '').toLowerCase();
        return SPREADSHEET_EXTS.some(ext => lower.endsWith(ext));
      }

      const myItems = (myFiles || []).filter(isRelevantItem).map(f => ({
        ...f,
        isMine: true,
        source: 'my',
        ownerName: 'Saya'
      }));

      const groupItems = (groups || []).filter(isRelevantItem).map(f => ({
        ...f,
        isMine: false,
        source: 'group',
        isShared: true,
        ownerName: f.owner?.name || f.metadata?.['sys:share_owner_name'] || 'Grup'
      }));

      const sharedItems = (sharedFiles || [])
        .filter(f => {
          // Buang file public (milik siapa saja)
          const isPublic = f.metadata?.['sys:is_public'] === 'true' || f.metadata?.['sys:is_public'] === true;
          if (isPublic) return false;
          return isRelevantItem(f);
        })
        .map(f => ({
          ...f,
          isMine: false,
          source: 'shared',
          isShared: true,
          ownerName: f.owner?.name || f.metadata?.['sys:share_owner_name'] || f.metadata?.['uploader_name'] || 'Dibagikan'
        }));

      // Deduplicate items by path or name
      const seen = new Set();
      const combined = [];
      for (const item of [...myItems, ...groupItems, ...sharedItems]) {
        const key = item.path || item.name;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }

      allFiles = combined;
      applyFilterAndRender();

    } catch (err) {
      console.warn('Gagal memuat file cloud:', err);
    } finally {
      if (elements.filesLoading) elements.filesLoading.style.display = 'none';
    }
  }

  async function handleOpenFileOrFolder(file) {
    if (file.type === 1) {
      // Folder / Group: fetch files inside folder
      if (elements.filesLoading) elements.filesLoading.style.display = 'flex';
      try {
        const subFiles = await apiFetchFileList(file.path);
        if (subFiles && subFiles.length > 0) {
          renderFileList(subFiles);
        } else {
          // Open new workspace within this store folder
          openBlankSpreadsheet(`${file.name}.xlsx`);
        }
      } catch (e) {
        openBlankSpreadsheet(`${file.name}.xlsx`);
      } finally {
        if (elements.filesLoading) elements.filesLoading.style.display = 'none';
      }
    } else {
      // Direct File: stream binary and open in WASM
      try {
        const streamUrl = await apiGetFileDownloadUrl(file.path);
        const res = await fetch(streamUrl);
        const arrayBuf = await res.arrayBuffer();
        openSpreadsheetWithBytes(file.name, arrayBuf);
      } catch (err) {
        console.warn('Gagal membuka file biner:', err);
        openBlankSpreadsheet(file.name);
      }
    }
  }

  function openBlankSpreadsheet(title) {
    window.__bina_pending_new = true;
    hideDashboard();
  }

  function openSpreadsheetWithBytes(filename, arrayBuffer) {
    window.__bina_pending_open = {
      name: filename,
      bytes: new Uint8Array(arrayBuffer)
    };
    hideDashboard();
  }

  function showDashboard() {
    isEditorActive = false;
    if (elements.dashboard) elements.dashboard.classList.remove('hidden');
    const { user } = getStoredAuth();
    if (user) {
      updateDashboardProfile(user);
      loadDashboardFiles();
    }
  }

  function hideDashboard() {
    isEditorActive = true;
    if (elements.dashboard) elements.dashboard.classList.add('hidden');
  }

  function handleFilterSearch(query) {
    applyFilterAndRender();
  }

  /* ==================== AUTH CONTROLLER ==================== */

  function setAuthenticatedState(isAuthenticated, user = null) {
    if (isAuthenticated && user) {
      syncUserToWasm(user);
      if (elements.loginModal) elements.loginModal.classList.add('hidden');
      if (!isEditorActive) {
        showDashboard();
      }
    } else {
      window.__bina_user = null;
      window.__bina_avatar_bytes = null;
      if (elements.dashboard) elements.dashboard.classList.add('hidden');
      if (elements.editorBackBtn) elements.editorBackBtn.classList.add('hidden');
      if (elements.loginModal) elements.loginModal.classList.remove('hidden');

      currentStep = 'nik';
      if (elements.stepNik) {
        elements.stepNik.classList.add('active');
        elements.stepNik.classList.remove('slide-exit-left', 'slide-exit-right');
      }
      if (elements.stepPassword) {
        elements.stepPassword.classList.remove('active', 'slide-exit-left', 'slide-exit-right');
      }
      if (elements.nikInput) elements.nikInput.focus();
    }
  }

  function handleNikSubmit(e) {
    e.preventDefault();
    const nik = elements.nikInput.value.trim();
    if (!nik) {
      elements.nikInput.focus();
      return;
    }
    localStorage.setItem(STORAGE_KEYS.SAVED_NIK, nik);
    transitionTo('password');
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    hideError();

    const nik = elements.nikInput.value.trim();
    const password = elements.passwordInput.value;

    if (!nik) {
      transitionTo('nik');
      return;
    }
    if (!password) {
      showError('Harap masukkan password');
      elements.passwordInput.focus();
      return;
    }

    setSubmitting(true);

    try {
      const authResult = await apiLogin(nik, password);
      const token = authResult.token?.access_token || authResult.token;
      if (!token) throw new Error('Token otentikasi tidak ditemukan');

      const rawUser = authResult.user || {};
      const profile = {
        nik: nik,
        nama: rawUser.nickname || rawUser.nama || authResult.usr_nama || ('Karyawan ' + nik.slice(-4)),
        avatar: rawUser.avatar || '',
        id: rawUser.id || authResult.usr_id || ''
      };

      setStoredAuth(token, profile);
      setAuthenticatedState(true, profile);

    } catch (err) {
      console.error('Login error:', err);
      let errMsg = err.message || 'NIK atau kata sandi tidak sesuai';
      if (errMsg.toLowerCase().includes('failed to fetch') || errMsg.toLowerCase().includes('networkerror')) {
        errMsg = 'Gagal terhubung ke server cloud';
      }
      showError(errMsg);
      if (elements.passwordInput) elements.passwordInput.select();
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    if (confirm('Keluar dari akun Bina Excel?')) {
      setStoredAuth(null, null);
      if (elements.popover) elements.popover.classList.add('hidden');
      setAuthenticatedState(false);
    }
  }

  function handleGoogleLogin() {
    alert('Fitur Login Google Workspace (@laskarbuah.com / @bina.com) sedang dipersiapkan.\n\nSilakan gunakan NIK dan kata sandi karyawan Anda.');
  }

  function checkExistingSession() {
    const { token, user } = getStoredAuth();
    if (!token) {
      setAuthenticatedState(false);
      return;
    }
    if (user) {
      setAuthenticatedState(true, user);
    }
  }

  function init() {
    initElements();

    // Login listeners
    if (elements.stepNik) elements.stepNik.addEventListener('submit', handleNikSubmit);
    if (elements.stepPassword) elements.stepPassword.addEventListener('submit', handlePasswordSubmit);
    if (elements.btnBackToNik) elements.btnBackToNik.addEventListener('click', () => transitionTo('nik'));
    if (elements.btnGoogleLogin) elements.btnGoogleLogin.addEventListener('click', handleGoogleLogin);
    if (elements.passwordInput) elements.passwordInput.addEventListener('input', hideError);
    if (elements.nikInput) elements.nikInput.addEventListener('input', hideError);

    // Dashboard listeners
    if (elements.btnCreateWorkspace) {
      elements.btnCreateWorkspace.addEventListener('click', () => {
        openBlankSpreadsheet('Spreadsheet Tanpa Judul.xlsx');
      });
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        handleFilterSearch(e.target.value);
      });
    }

    if (elements.avatarBtn) {
      elements.avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (elements.popover) elements.popover.classList.toggle('hidden');
      });
    }

    if (elements.popoverLogoutBtn) {
      elements.popoverLogoutBtn.addEventListener('click', handleLogout);
    }

    if (elements.filterOwnerBtn && elements.filterOwnerPopover) {
      elements.filterOwnerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.filterOwnerPopover.classList.toggle('hidden');
      });

      elements.filterOwnerPopover.querySelectorAll('.filter-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const fMode = opt.getAttribute('data-filter') || 'mine';
          currentOwnerFilter = fMode;
          if (elements.filterOwnerLabel) {
            elements.filterOwnerLabel.textContent = opt.textContent.trim();
          }
          elements.filterOwnerPopover.querySelectorAll('.filter-opt').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          elements.filterOwnerPopover.classList.add('hidden');
          applyFilterAndRender();
        });
      });
    }

    if (elements.btnOpenLocalFile) {
      elements.btnOpenLocalFile.addEventListener('click', () => {
        // Trigger file input or open blank
        openBlankSpreadsheet('Spreadsheet Baru.xlsx');
      });
    }

    // Close popover when clicked outside
    document.addEventListener('click', (e) => {
      if (elements.popover && !elements.popover.classList.contains('hidden')) {
        if (!elements.popover.contains(e.target) && !elements.avatarBtn.contains(e.target)) {
          elements.popover.classList.add('hidden');
        }
      }
      if (elements.filterOwnerPopover && !elements.filterOwnerPopover.classList.contains('hidden')) {
        if (!elements.filterOwnerPopover.contains(e.target) && !elements.filterOwnerBtn.contains(e.target)) {
          elements.filterOwnerPopover.classList.add('hidden');
        }
      }
    });

    // Load saved NIK
    const savedNik = localStorage.getItem(STORAGE_KEYS.SAVED_NIK);
    if (savedNik && elements.nikInput) {
      elements.nikInput.value = savedNik;
    }

    checkExistingSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BinaPortal = {
    getAuth: getStoredAuth,
    logout: handleLogout,
    updateUser: syncUserToWasm,
    transitionTo: transitionTo,
    showDashboard: showDashboard,
    hideDashboard: hideDashboard,
    openBlank: openBlankSpreadsheet,
    openFileBytes: openSpreadsheetWithBytes
  };
})();
