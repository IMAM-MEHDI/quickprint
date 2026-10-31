/* ═══════════════════════════════════════════════════════
   Imam CSC Centre — Customer Print Portal
   Application Logic (Mock Frontend)
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Backend API Base ──
  const API_BASE = window.QUICKPRINT_API_BASE || localStorage.getItem('quickprint_api_base') || 'https://quickprint-backend.imam-csc.workers.dev/api';

  // ── Shop Configuration (synced with backend API) ──
  const SHOP_CONFIG = {
    name: 'Imam CSC Centre',
    maxFileSizeMB: 20,
    maxPages: 100,
    maxCopies: 50,
    paperSizes: ['A4'],            // only A4 initially
    colourSupported: true,         // printer supports colour
    duplexSupported: true,         // printer supports double-sided
    pricing: {
      bw: 2.00,        // ₹ per page, black & white
      colour: 10.00,   // ₹ per page, colour
    },
    currency: '₹',
    currencyLocale: 'en-IN',
  };

  // ── State ──
  const state = {
    file: null,
    fileName: '',
    fileSize: 0,
    pageCount: 0,
    // Settings
    paperSize: 'A4',
    colourMode: 'bw',       // 'bw' | 'colour'
    sides: 'single',        // 'single' | 'double'
    copies: 1,
    pageRange: '',           // '' = all, or e.g. '1-5'
    // Computed
    effectivePages: 0,
    estimatedPrice: 0,
    // Job
    jobId: '',
    jobNumber: '',
    trackingToken: '',
    jobStatus: 'uploaded',
    pollTimer: null,
  };


  // ── DOM References ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Pages
    pageHome: $('#page-home'),
    pageUpload: $('#page-upload'),
    pageConfirm: $('#page-confirm'),
    // Home
    btnUploadPdf: $('#btn-upload-pdf'),
    btnPrivacyDetails: $('#btn-privacy-details'),
    footerPrivacyLink: $('#footer-privacy-link'),
    maxFileSizeDisplay: $('#max-file-size-display'),
    maxPagesDisplay: $('#max-pages-display'),
    qrCanvas: $('#qr-canvas'),
    // Upload
    btnBackHome: $('#btn-back-home'),
    uploadZone: $('#upload-zone'),
    fileInput: $('#file-input'),
    fileError: $('#file-error'),
    fileInfo: $('#file-info'),
    fileName: $('#file-name'),
    fileSize: $('#file-size'),
    btnFileRemove: $('#btn-file-remove'),
    uploadProgress: $('#upload-progress'),
    progressFill: $('#progress-fill'),
    progressLabel: $('#progress-label'),
    progressPct: $('#progress-pct'),
    settingsSection: $('#settings-section'),
    selectPaperSize: $('#select-paper-size'),
    segColour: $('#seg-colour'),
    segSides: $('#seg-sides'),
    rowColourMode: $('#row-colour-mode'),
    rowSides: $('#row-sides'),
    btnCopiesMinus: $('#btn-copies-minus'),
    btnCopiesPlus: $('#btn-copies-plus'),
    copiesValue: $('#copies-value'),
    inputPageRange: $('#input-page-range'),
    priceTotal: $('#price-total'),
    pricePagesLabel: $('#price-pages-label'),
    pricePerPage: $('#price-per-page'),
    priceCopiesLabel: $('#price-copies-label'),
    priceSubtotal: $('#price-subtotal'),
    btnSubmitJob: $('#btn-submit-job'),
    linkPrivacyUpload: $('#link-privacy-upload'),
    // Confirm
    confirmIcon: $('#confirm-icon'),
    jobNumber: $('#job-number'),
    statusBadge: $('#status-badge'),
    statusText: $('#status-text'),
    summaryFile: $('#summary-file'),
    summaryPaper: $('#summary-paper'),
    summaryColour: $('#summary-colour'),
    summarySides: $('#summary-sides'),
    summaryPages: $('#summary-pages'),
    summaryCopies: $('#summary-copies'),
    summaryPrice: $('#summary-price'),
    noticeJobRef: $('#notice-job-ref'),
    btnCopyJobNumber: $('#btn-copy-job-number'),
    btnNewJob: $('#btn-new-job'),
    statusTimeline: $('#status-timeline'),
    // Modal
    modalPrivacy: $('#modal-privacy'),
    btnClosePrivacy: $('#btn-close-privacy'),
    // Toast
    toast: $('#toast'),
  };

  // ── Initialization ──
  function loadShopConfig() {
    try {
      const saved = localStorage.getItem('imam_csc_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.pricing) Object.assign(SHOP_CONFIG.pricing, parsed.pricing);
        if (parsed.maxFileSizeMB) SHOP_CONFIG.maxFileSizeMB = parsed.maxFileSizeMB;
        if (parsed.maxPages) SHOP_CONFIG.maxPages = parsed.maxPages;
        if (parsed.maxCopies) SHOP_CONFIG.maxCopies = parsed.maxCopies;
        if (typeof parsed.colourSupported === 'boolean') SHOP_CONFIG.colourSupported = parsed.colourSupported;
        if (typeof parsed.duplexSupported === 'boolean') SHOP_CONFIG.duplexSupported = parsed.duplexSupported;
      }

      // Fetch fresh config from backend API
      fetch(`${API_BASE}/config`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (!data) return;
          if (data.shop_name) SHOP_CONFIG.name = data.shop_name;
          if (data.pricing) {
            SHOP_CONFIG.pricing.bw = data.pricing.bw / 100;
            SHOP_CONFIG.pricing.colour = data.pricing.colour / 100;
          }
          if (data.limits) {
            if (data.limits.max_file_size_mb) SHOP_CONFIG.maxFileSizeMB = data.limits.max_file_size_mb;
            if (data.limits.max_pages) SHOP_CONFIG.maxPages = data.limits.max_pages;
            if (data.limits.max_copies) SHOP_CONFIG.maxCopies = data.limits.max_copies;
          }
          if (data.options) {
            if (data.options.paper_sizes) SHOP_CONFIG.paperSizes = data.options.paper_sizes;
            SHOP_CONFIG.colourSupported = data.options.colour_supported !== false;
            SHOP_CONFIG.duplexSupported = data.options.duplex_supported !== false;
          }
          applyShopConfig();
          recalcPrice();
        })
        .catch((err) => console.warn('Could not sync config with backend:', err));
    } catch (e) {
      console.warn('Failed to load shop config', e);
    }
  }

  function init() {
    loadShopConfig();
    applyShopConfig();
    bindEvents();
    generateQR();
    checkUrlForJob();

    window.addEventListener('storage', (e) => {
      if (e.key === 'imam_csc_config') {
        loadShopConfig();
        applyShopConfig();
        updatePricing();
      }
      if (e.key === 'imam_csc_jobs') {
        checkUrlForJob();
      }
    });
  }

  function applyShopConfig() {
    dom.maxFileSizeDisplay.textContent = SHOP_CONFIG.maxFileSizeMB + ' MB';
    dom.maxPagesDisplay.textContent = SHOP_CONFIG.maxPages;

    // Paper sizes
    dom.selectPaperSize.innerHTML = '';
    SHOP_CONFIG.paperSizes.forEach((size) => {
      const opt = document.createElement('option');
      opt.value = size;
      opt.textContent = size;
      dom.selectPaperSize.appendChild(opt);
    });

    // Colour support
    if (!SHOP_CONFIG.colourSupported) {
      dom.rowColourMode.classList.add('hidden');
      state.colourMode = 'bw';
    }

    // Duplex support
    if (!SHOP_CONFIG.duplexSupported) {
      dom.rowSides.classList.add('hidden');
      state.sides = 'single';
    }
  }

  // ── QR Code ──
  function generateQR() {
    if (typeof QRCode === 'undefined') return;
    const url = window.location.href.split('?')[0];
    QRCode.toCanvas(dom.qrCanvas, url, {
      width: 140,
      margin: 1,
      color: { dark: '#1e3a5f', light: '#ffffff' },
    });
  }

  // ── Page Navigation ──
  function showPage(pageId) {
    $$('.page').forEach((p) => {
      p.classList.remove('active');
      p.style.animation = 'none';
    });
    const page = $(`#${pageId}`);
    // Force reflow for animation restart
    void page.offsetWidth;
    page.style.animation = '';
    page.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Event Binding ──
  function bindEvents() {
    // Home → Upload
    dom.btnUploadPdf.addEventListener('click', () => showPage('page-upload'));

    // Back to Home
    dom.btnBackHome.addEventListener('click', () => {
      resetUpload();
      showPage('page-home');
    });

    // Upload zone click
    dom.uploadZone.addEventListener('click', () => dom.fileInput.click());
    dom.uploadZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dom.fileInput.click();
      }
    });

    // Drag & drop
    dom.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.uploadZone.classList.add('drag-over');
    });
    dom.uploadZone.addEventListener('dragleave', () => {
      dom.uploadZone.classList.remove('drag-over');
    });
    dom.uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.uploadZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFileSelected(files[0]);
    });

    // File input change
    dom.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileSelected(e.target.files[0]);
    });

    // Remove file
    dom.btnFileRemove.addEventListener('click', resetUpload);

    // Segmented controls
    setupSegControl(dom.segColour, (val) => {
      state.colourMode = val;
      recalcPrice();
    });
    setupSegControl(dom.segSides, (val) => {
      state.sides = val;
      recalcPrice();
    });

    // Paper size
    dom.selectPaperSize.addEventListener('change', (e) => {
      state.paperSize = e.target.value;
      recalcPrice();
    });

    // Copies stepper
    dom.btnCopiesMinus.addEventListener('click', () => {
      if (state.copies > 1) {
        state.copies--;
        dom.copiesValue.textContent = state.copies;
        recalcPrice();
      }
    });
    dom.btnCopiesPlus.addEventListener('click', () => {
      if (state.copies < SHOP_CONFIG.maxCopies) {
        state.copies++;
        dom.copiesValue.textContent = state.copies;
        recalcPrice();
      }
    });

    // Page range
    dom.inputPageRange.addEventListener('input', () => {
      state.pageRange = dom.inputPageRange.value.trim();
      recalcPrice();
    });

    // Submit job
    dom.btnSubmitJob.addEventListener('click', submitJob);

    // Privacy modal
    dom.btnPrivacyDetails.addEventListener('click', openPrivacyModal);
    dom.footerPrivacyLink.addEventListener('click', (e) => { e.preventDefault(); openPrivacyModal(); });
    dom.linkPrivacyUpload.addEventListener('click', (e) => { e.preventDefault(); openPrivacyModal(); });
    dom.btnClosePrivacy.addEventListener('click', closePrivacyModal);
    dom.modalPrivacy.addEventListener('click', (e) => {
      if (e.target === dom.modalPrivacy) closePrivacyModal();
    });

    // Confirm page actions
    dom.btnCopyJobNumber.addEventListener('click', copyJobNumber);
    dom.btnNewJob.addEventListener('click', () => {
      resetUpload();
      showPage('page-upload');
    });
  }

  // ── Segmented Control Helper ──
  function setupSegControl(container, onChange) {
    const buttons = container.querySelectorAll('.seg-option');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.dataset.value);
      });
    });
  }

  // ── File Handling ──
  function handleFileSelected(file) {
    clearFileError();

    // Validate type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showFileError('Only PDF files are accepted.');
      return;
    }

    // Validate size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > SHOP_CONFIG.maxFileSizeMB) {
      showFileError(`File is too large (${sizeMB.toFixed(1)} MB). Maximum is ${SHOP_CONFIG.maxFileSizeMB} MB.`);
      return;
    }

    state.file = file;
    state.fileName = file.name;
    state.fileSize = file.size;

    // Display file info
    dom.fileName.textContent = file.name;
    dom.fileSize.textContent = formatFileSize(file.size) + ' · counting pages…';
    dom.fileInfo.classList.add('visible');
    dom.uploadZone.style.display = 'none';

    // Simulate upload progress
    simulateUpload();

    // Count pages with PDF.js
    countPDFPages(file);
  }

  function countPDFPages(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (typeof pdfjsLib === 'undefined') {
          // Fallback if PDF.js didn't load
          state.pageCount = 1;
          onPagesCounted();
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        state.pageCount = pdf.numPages;

        // Validate page count
        if (state.pageCount > SHOP_CONFIG.maxPages) {
          showFileError(`This file has ${state.pageCount} pages. Maximum is ${SHOP_CONFIG.maxPages} pages.`);
          resetUpload();
          return;
        }

        onPagesCounted();
      } catch (err) {
        console.warn('PDF.js page count failed:', err);
        // Still allow upload — server will validate
        state.pageCount = 0;
        dom.fileSize.textContent = formatFileSize(state.fileSize) + ' · page count unavailable';
        enableSettings();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onPagesCounted() {
    dom.fileSize.textContent = formatFileSize(state.fileSize) + ' · ' + state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
    enableSettings();
    recalcPrice();
  }

  function enableSettings() {
    dom.settingsSection.style.display = '';
    dom.btnSubmitJob.disabled = false;
  }

  function simulateUpload() {
    dom.uploadProgress.classList.add('visible');
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        dom.progressLabel.textContent = 'Upload complete';
        dom.progressPct.textContent = '100%';
        dom.progressFill.style.width = '100%';
        // Hide after a moment
        setTimeout(() => {
          dom.uploadProgress.classList.remove('visible');
        }, 1200);
      } else {
        dom.progressFill.style.width = progress + '%';
        dom.progressPct.textContent = Math.round(progress) + '%';
      }
    }, 200);
  }

  function resetUpload() {
    state.file = null;
    state.fileName = '';
    state.fileSize = 0;
    state.pageCount = 0;
    state.copies = 1;
    state.pageRange = '';
    state.colourMode = 'bw';
    state.sides = 'single';

    dom.fileInput.value = '';
    dom.fileInfo.classList.remove('visible');
    dom.uploadZone.style.display = '';
    dom.uploadProgress.classList.remove('visible');
    dom.progressFill.style.width = '0%';
    dom.settingsSection.style.display = '';
    dom.btnSubmitJob.disabled = true;
    dom.copiesValue.textContent = '1';
    dom.inputPageRange.value = '';
    clearFileError();

    // Reset seg controls
    dom.segColour.querySelectorAll('.seg-option').forEach((b, i) => {
      b.classList.toggle('active', i === 0);
    });
    dom.segSides.querySelectorAll('.seg-option').forEach((b, i) => {
      b.classList.toggle('active', i === 0);
    });

    recalcPrice();
  }

  // ── Price Calculation ──
  function recalcPrice() {
    const pageCount = state.pageCount || 0;
    let effectivePages = pageCount;

    // Parse page range
    if (state.pageRange) {
      const parsed = parsePageRange(state.pageRange, pageCount);
      if (parsed !== null) {
        effectivePages = parsed;
      }
    }

    // Double-sided halves effective sheets (but we price per page printed)
    // For pricing, we still count pages, not sheets
    state.effectivePages = effectivePages;

    const pricePerPage = state.colourMode === 'colour'
      ? SHOP_CONFIG.pricing.colour
      : SHOP_CONFIG.pricing.bw;

    const subtotal = effectivePages * pricePerPage;
    const total = subtotal * state.copies;
    state.estimatedPrice = total;

    // Update DOM
    const fmt = (n) => SHOP_CONFIG.currency + n.toFixed(2);
    const modeLabel = state.colourMode === 'colour' ? 'Colour' : 'B&W';

    dom.priceTotal.textContent = fmt(total);
    dom.pricePagesLabel.textContent = `${effectivePages} page${effectivePages !== 1 ? 's' : ''} × ${modeLabel}`;
    dom.pricePerPage.textContent = fmt(pricePerPage) + '/page';
    dom.priceCopiesLabel.textContent = `× ${state.copies} cop${state.copies !== 1 ? 'ies' : 'y'}`;
    dom.priceSubtotal.textContent = fmt(total);
  }

  function parsePageRange(rangeStr, totalPages) {
    // Supports: "1-5", "1,3,5", "1-3,7-10", "5", etc.
    if (!rangeStr || totalPages === 0) return null;
    const pages = new Set();
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [a, b] = trimmed.split('-').map(Number);
        if (isNaN(a) || isNaN(b)) return null;
        const start = Math.max(1, Math.min(a, totalPages));
        const end = Math.max(1, Math.min(b, totalPages));
        for (let i = start; i <= end; i++) pages.add(i);
      } else {
        const n = parseInt(trimmed, 10);
        if (isNaN(n)) return null;
        if (n >= 1 && n <= totalPages) pages.add(n);
      }
    }
    return pages.size > 0 ? pages.size : null;
  }

  // ── Job Submission (Live Backend API) ──
  async function submitJob() {
    if (!state.file) return;

    dom.btnSubmitJob.disabled = true;
    dom.btnSubmitJob.innerHTML = '<span class="spinner"></span> Uploading PDF to server…';
    clearFileError();

    try {
      const formData = new FormData();
      formData.append('file', state.file);
      formData.append('paper_size', state.paperSize);
      formData.append('colour_mode', state.colourMode);
      formData.append('sides', state.sides);
      formData.append('copies', String(state.copies));
      formData.append('page_range', state.pageRange || 'All');
      formData.append('page_count', String(state.pageCount));

      const resp = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${resp.status}`);
      }

      const data = await resp.json();
      state.jobId = data.id;
      state.jobNumber = data.job_number;
      state.trackingToken = data.tracking_token;
      state.jobStatus = data.status || 'uploaded';
      if (typeof data.estimated_price === 'number') {
        state.estimatedPrice = data.estimated_price / 100;
      }

      // Store in localStorage for customer tracking history
      saveJobLocally();

      // Populate confirmation page with live details
      populateConfirmation();

      showPage('page-confirm');
      showToast('Print job submitted successfully!');

      // Start live status polling
      startTrackingPoll(state.jobId, state.trackingToken);
    } catch (err) {
      console.error('Job submission failed:', err);
      showFileError('Upload failed: ' + err.message);
      showToast('Upload error: ' + err.message);
    } finally {
      dom.btnSubmitJob.innerHTML = 'Submit Print Job';
      dom.btnSubmitJob.disabled = false;
    }
  }

  function saveJobLocally() {
    const jobs = JSON.parse(localStorage.getItem('imam_csc_jobs') || '[]');
    jobs.unshift({
      id: state.jobId,
      jobNumber: state.jobNumber,
      trackingToken: state.trackingToken,
      fileName: state.fileName,
      fileSize: state.fileSize,
      pageCount: state.pageCount,
      paperSize: state.paperSize,
      colourMode: state.colourMode,
      sides: state.sides,
      copies: state.copies,
      pageRange: state.pageRange || 'All',
      effectivePages: state.effectivePages,
      estimatedPrice: state.estimatedPrice,
      status: state.jobStatus,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem('imam_csc_jobs', JSON.stringify(jobs.slice(0, 50)));
  }

  function startTrackingPoll(jobId, token) {
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (!jobId || !token) return;

    state.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/jobs/${jobId}?token=${token}`);
        if (!resp.ok) return;

        const data = await resp.json();
        if (data.status && data.status !== state.jobStatus) {
          state.jobStatus = data.status;
          updateStatusBadge(data.status);
          updateTimeline(data.status);

          // Update local storage
          const jobs = JSON.parse(localStorage.getItem('imam_csc_jobs') || '[]');
          const match = jobs.find((j) => j.id === jobId || j.jobNumber === state.jobNumber);
          if (match) {
            match.status = data.status;
            localStorage.setItem('imam_csc_jobs', JSON.stringify(jobs));
          }

          if (data.status === 'confirmed') {
            showToast('💳 Payment confirmed at counter!');
          } else if (data.status === 'approved') {
            showToast('✓ Job approved for printing!');
          } else if (data.status === 'printing') {
            showToast('🖨️ Document is currently printing on Canon PIXMA G2010...');
          } else if (data.status === 'completed') {
            showToast('🎉 Print completed! Ready for counter pickup.');
            clearInterval(state.pollTimer);
          } else if (data.status === 'rejected') {
            showToast('❌ Job rejected: ' + (data.rejection_reason || ''));
            clearInterval(state.pollTimer);
          }
        }
      } catch (e) {
        // network polling error - silently retry next cycle
      }
    }, 3500);
  }

  function populateConfirmation() {
    dom.jobNumber.textContent = state.jobNumber;
    dom.noticeJobRef.textContent = state.jobNumber;

    dom.summaryFile.textContent = truncateFilename(state.fileName, 24);
    dom.summaryPaper.textContent = state.paperSize;
    dom.summaryColour.textContent = state.colourMode === 'colour' ? 'Colour' : 'Black & White';
    dom.summarySides.textContent = state.sides === 'double' ? 'Double-sided' : 'Single-sided';
    dom.summaryPages.textContent = state.pageRange || 'All (' + state.pageCount + ')';
    dom.summaryCopies.textContent = state.copies;
    dom.summaryPrice.textContent = SHOP_CONFIG.currency + state.estimatedPrice.toFixed(2);

    updateStatusBadge(state.jobStatus || 'uploaded');
    updateTimeline(state.jobStatus || 'uploaded');
  }

  // ── Status Management ──
  const STATUS_ORDER = ['uploaded', 'awaiting', 'confirmed', 'approved', 'printing', 'completed'];
  const STATUS_LABELS = {
    uploaded: 'Uploaded',
    awaiting: 'Awaiting Payment',
    confirmed: 'Payment Confirmed',
    approved: 'Approved',
    printing: 'Printing',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };

  function updateStatusBadge(status) {
    // Remove all status classes
    dom.statusBadge.className = 'status-badge ' + status;
    dom.statusText.textContent = STATUS_LABELS[status] || status;
  }

  function updateTimeline(currentStatus) {
    const items = dom.statusTimeline.querySelectorAll('.timeline-item');
    const idx = STATUS_ORDER.indexOf(currentStatus);

    items.forEach((item, i) => {
      item.classList.remove('done', 'current', 'pending');
      if (i < idx) {
        item.classList.add('done');
        item.querySelector('.timeline-dot').textContent = '✓';
      } else if (i === idx) {
        item.classList.add('current');
        item.querySelector('.timeline-dot').textContent = '●';
      } else {
        item.classList.add('pending');
        item.querySelector('.timeline-dot').textContent = '○';
      }
    });
  }

  // ── Check URL for tracking ──
  function checkUrlForJob() {
    const params = new URLSearchParams(window.location.search);
    const jobNum = params.get('job');
    if (jobNum) {
      const jobs = JSON.parse(localStorage.getItem('imam_csc_jobs') || '[]');
      const job = jobs.find((j) => j.jobNumber === jobNum || j.id === jobNum);
      if (job) {
        state.jobId = job.id || '';
        state.jobNumber = job.jobNumber;
        state.trackingToken = job.trackingToken || '';
        state.fileName = job.fileName;
        state.fileSize = job.fileSize;
        state.pageCount = job.pageCount;
        state.paperSize = job.paperSize;
        state.colourMode = job.colourMode;
        state.sides = job.sides;
        state.copies = job.copies;
        state.pageRange = job.pageRange;
        state.effectivePages = job.effectivePages;
        state.estimatedPrice = job.estimatedPrice;
        state.jobStatus = job.status;

        populateConfirmation();
        showPage('page-confirm');

        if (state.jobId && state.trackingToken) {
          startTrackingPoll(state.jobId, state.trackingToken);
        }
      }
    }
  }

  // ── Privacy Modal ──
  function openPrivacyModal() {
    dom.modalPrivacy.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePrivacyModal() {
    dom.modalPrivacy.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Copy Job Number ──
  function copyJobNumber() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(state.jobNumber).then(() => {
        showToast('Job number copied!');
      });
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = state.jobNumber;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Job number copied!');
    }
  }

  // ── Error Handling ──
  function showFileError(msg) {
    dom.fileError.textContent = msg;
    dom.fileError.classList.add('visible');
  }

  function clearFileError() {
    dom.fileError.textContent = '';
    dom.fileError.classList.remove('visible');
  }

  // ── Toast ──
  function showToast(msg, duration = 3000) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    setTimeout(() => {
      dom.toast.classList.remove('show');
    }, duration);
  }

  // ── Utilities ──
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function truncateFilename(name, max) {
    if (name.length <= max) return name;
    const ext = name.lastIndexOf('.');
    if (ext === -1) return name.slice(0, max - 1) + '…';
    const base = name.slice(0, ext);
    const extension = name.slice(ext);
    const allowedBase = max - extension.length - 1;
    return base.slice(0, allowedBase) + '…' + extension;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', init);
})();
