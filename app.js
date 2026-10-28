(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "svc_settings_v1";
  const DB_NAME = "salesVisitCameraDB";
  const DB_VERSION = 1;
  const STORE_NAME = "photos";

  let settings = { sales: "", company: "" };
  let currentVisit = null;
  let cameraStream = null;
  let facingMode = "environment";
  let originalImage = null;
  let originalBlob = null;
  let originalFromCamera = false;
  let renderedBlob = null;
  let toastTimer = null;
  let dbPromise = null;

  function showToast(message, duration = 3000) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), duration);
  }
  function setBusy(on, message = "Memproses foto...") {
    $("busyText").textContent = message;
    $("busyOverlay").classList.toggle("hidden", !on);
  }
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (id !== "cameraScreen") stopCamera();
    if (id === "historyScreen") renderHistory();
  }
  function loadSettings() {
    try { settings = { ...settings, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) }; }
    catch (_) { settings = { sales: "", company: "" }; }
    $("settingSales").value = settings.sales || "";
    $("settingCompany").value = settings.company || "";
    $("homeSalesName").textContent = settings.sales || "Atur nama sales";
    $("salesAvatar").textContent = (settings.sales || "S").trim().charAt(0).toUpperCase() || "S";
  }
  function saveSettings(event) {
    if (event) event.preventDefault();
    const sales = $("settingSales").value.trim();
    if (!sales) { showToast("Nama sales wajib diisi."); $("settingSales").focus(); return; }
    settings = { sales, company: $("settingCompany").value.trim() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    loadSettings();
    showToast("Pengaturan berhasil disimpan.");
    showScreen("homeScreen");
  }
  function localDateParts(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return { date: `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
  }
  function applyNowDateTime() {
    const now = localDateParts();
    $("visitDate").value = now.date;
    $("visitTime").value = now.time;
  }
  function getRecentStores() {
    return getAllPhotos().then(items => {
      const names = [...new Set(items.map(x => x.store).filter(Boolean))].sort((a,b) => a.localeCompare(b, "id"));
      $("storeSuggestions").innerHTML = "";
      names.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        $("storeSuggestions").appendChild(option);
      });
    }).catch(() => {});
  }
  function openVisitForm() {
    if (!settings.sales) {
      showToast("Isi nama sales terlebih dahulu.");
      $("settingSales").value = "";
      showScreen("settingsScreen");
      $("settingSales").focus();
      return;
    }
    $("storeName").value = "";
    $("visitSales").value = settings.sales;
    $("visitLocation").value = "";
    $("gpsStatus").textContent = "Lokasi tidak ditampilkan pada watermark. Anda dapat mengisi lokasi jika diperlukan.";
    applyNowDateTime();
    getRecentStores();
    showScreen("visitScreen");
    setTimeout(() => $("storeName").focus(), 200);
  }
  function getLocation() {
    if (!navigator.geolocation) {
      $("gpsStatus").textContent = "Browser tidak mendukung GPS. Isi lokasi secara manual.";
      showToast("GPS tidak didukung browser ini.");
      return;
    }
    $("getLocationBtn").disabled = true;
    $("getLocationBtn").textContent = "Mencari...";
    $("gpsStatus").textContent = "Meminta lokasi perangkat...";
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        $("visitLocation").value = `${lat}, ${lon}`;
        $("gpsStatus").textContent = `GPS diperoleh (akurasi sekitar ${Math.round(pos.coords.accuracy)} meter). Lokasi tidak ditampilkan pada watermark.`;
        $("getLocationBtn").disabled = false;
        $("getLocationBtn").textContent = "◎ Ambil GPS";
        showToast("Lokasi GPS berhasil diperoleh.");
      },
      err => {
        const message = err.code === 1 ? "Izin lokasi ditolak." : err.code === 2 ? "Lokasi tidak tersedia." : "Waktu mencari lokasi habis.";
        $("gpsStatus").textContent = `${message} Anda tetap dapat mengisi lokasi secara manual.`;
        $("getLocationBtn").disabled = false;
        $("getLocationBtn").textContent = "◎ Ambil GPS";
        showToast(message + " Silakan isi manual bila perlu.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }
  function startCamera() {
    stopCamera();
    $("cameraError").classList.add("hidden");
    $("cameraPlaceholder").classList.remove("hidden");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError("Browser ini tidak mendukung kamera web. Buka aplikasi melalui HTTPS di browser modern seperti Chrome Android.");
      return;
    }
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    }).then(stream => {
      cameraStream = stream;
      const video = $("cameraVideo");
      video.srcObject = stream;
      video.classList.toggle("mirrored", facingMode === "user");
      const track = stream.getVideoTracks()[0];
      const actual = track && track.getSettings ? track.getSettings().facingMode : "";
      if (actual === "user") facingMode = "user";
      $("cameraPlaceholder").classList.add("hidden");
      return video.play().catch(() => {});
    }).catch(err => {
      let msg = "Kamera tidak dapat dibuka. Pastikan izin kamera diberikan dan tidak sedang dipakai aplikasi lain.";
      if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) msg = "Izin kamera ditolak. Buka pengaturan izin situs di browser, lalu izinkan kamera.";
      else if (err && (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")) msg = "Kamera tidak ditemukan pada perangkat ini.";
      else if (err && err.name === "NotReadableError") msg = "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
      showCameraError(msg);
    });
  }
  function showCameraError(message) {
    $("cameraError").textContent = message;
    $("cameraError").classList.remove("hidden");
    $("cameraPlaceholder").classList.remove("hidden");
  }
  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    const video = $("cameraVideo");
    if (video) video.srcObject = null;
  }
  async function switchCamera() {
    facingMode = facingMode === "environment" ? "user" : "environment";
    if (originalFromCamera && $("previewScreen").classList.contains("active")) {
      showScreen("cameraScreen");
    }
    startCamera();
  }
  function drawVideoToCanvas() {
    const video = $("cameraVideo");
    if (!cameraStream || !video.videoWidth || !video.videoHeight) {
      showToast("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }
    const canvas = $("captureCanvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    // Mirroring is applied only to front-camera capture so the result matches the preview.
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) { showToast("Foto gagal diproses. Silakan coba lagi."); return; }
      originalBlob = blob;
      originalFromCamera = true;
      loadImageFromBlob(blob).then(img => {
        originalImage = img;
        stopCamera();
        openPreview();
      }).catch(() => showToast("Foto gagal dibuka. Silakan coba lagi."));
    }, "image/jpeg", 0.94);
  }
  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal memuat gambar")); };
      img.src = url;
    });
  }
  function handleGalleryFile(file) {
    if (!file || !file.type.startsWith("image/")) { showToast("Pilih file gambar yang valid."); return; }
    setBusy(true, "Membuka foto...");
    originalBlob = file;
    originalFromCamera = false;
    loadImageFromBlob(file).then(img => {
      originalImage = img;
      setBusy(false);
      openPreview();
    }).catch(() => {
      setBusy(false);
      showToast("Foto dari galeri tidak dapat dibuka.");
    });
    $("galleryInput").value = "";
  }
  function openPreview() {
    $("editStore").value = currentVisit.store;
    $("editSales").value = currentVisit.sales;
    $("wmPosition").value = "bottom";
    $("wmStyle").value = "dark";
    showScreen("previewScreen");
    renderWatermark();
  }
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
  function fitText(ctx, text, maxWidth, initialSize, weight = 700) {
    let size = initialSize;
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    while (ctx.measureText(text).width > maxWidth && size > 12) {
      size -= 1;
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
    }
    return size;
  }
  function renderWatermark() {
    if (!originalImage) return;
    const canvas = $("watermarkCanvas");
    const maxSide = 2560;
    const scale = Math.min(1, maxSide / Math.max(originalImage.naturalWidth || originalImage.width, originalImage.naturalHeight || originalImage.height));
    const w = Math.max(1, Math.round((originalImage.naturalWidth || originalImage.width) * scale));
    const h = Math.max(1, Math.round((originalImage.naturalHeight || originalImage.height) * scale));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(originalImage, 0, 0, w, h);

    const store = $("editStore").value.trim() || "Nama toko";
    const sales = $("editSales").value.trim() || "Nama sales";
    const unit = Math.max(1, Math.min(w, h));
    const pad = Math.round(unit * 0.035);
    const titleSize = Math.max(17, Math.round(unit * 0.043));
    const labelSize = Math.max(13, Math.round(unit * 0.026));
    const lineGap = Math.round(titleSize * 1.22);
    const boxH = pad * 1.15 + titleSize * 1.1 + lineGap + labelSize * 1.2 + pad * .65;
    const boxW = Math.min(w - pad * 2, Math.max(Math.round(w * .52), Math.min(Math.round(w * .91), Math.max(ctx.measureText(store).width, ctx.measureText(sales).width) + pad * 3)));
    const x = pad;
    const y = $("wmPosition").value === "top" ? pad : h - boxH - pad;
    const light = $("wmStyle").value === "light";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.22)";
    ctx.shadowBlur = Math.max(4, unit * .012);
    ctx.fillStyle = light ? "rgba(255,255,255,.91)" : "rgba(13,27,42,.84)";
    roundRect(ctx, x, y, boxW, boxH, Math.max(8, unit * .018));
    ctx.fill();
    ctx.shadowColor = "transparent";
    // Subtle gold accent gives a polished, restrained professional look.
    ctx.fillStyle = "#d5ad58";
    roundRect(ctx, x, y + pad * .45, Math.max(4, pad * .18), boxH - pad * .9, Math.max(2, pad * .08));
    ctx.fill();
    const textX = x + pad * 1.05;
    const maxTextW = boxW - pad * 2.2;
    ctx.textBaseline = "top";
    ctx.fillStyle = light ? "#16283a" : "#ffffff";
    const storeSize = fitText(ctx, store.toUpperCase(), maxTextW, titleSize, 800);
    ctx.font = `800 ${storeSize}px Arial, sans-serif`;
    ctx.fillText(store.toUpperCase(), textX, y + pad * .7, maxTextW);
    ctx.fillStyle = light ? "#536476" : "rgba(255,255,255,.78)";
    const salesText = `SALES  ${sales}`;
    const salesSize = fitText(ctx, salesText, maxTextW, labelSize, 600);
    ctx.font = `600 ${salesSize}px Arial, sans-serif`;
    ctx.fillText(salesText, textX, y + pad * .7 + titleSize * 1.18, maxTextW);
    ctx.restore();
    canvas.toBlob(blob => { renderedBlob = blob; }, "image/jpeg", 0.94);
  }
  function getRenderedBlob() {
    return new Promise((resolve, reject) => {
      const canvas = $("watermarkCanvas");
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Gagal mengekspor foto")), "image/jpeg", 0.94);
    });
  }
  function safeFilePart(value) {
    return (value || "toko").normalize("NFKD").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 55) || "toko";
  }
  function filenameForVisit(visit) {
    const d = (visit.date || localDateParts().date).replace(/-/g, "");
    const t = (visit.time || localDateParts().time).replace(/:/g, "");
    return `${d}_${safeFilePart(visit.store)}_${t}.jpg`;
  }
  async function downloadCurrentPhoto() {
    const blob = await getRenderedBlob();
    const name = filenameForVisit({ ...currentVisit, store: $("editStore").value.trim(), sales: $("editSales").value.trim() });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { blob, name };
  }
  async function savePhoto() {
    if (!$("editStore").value.trim() || !$("editSales").value.trim()) {
      showToast("Nama toko dan nama sales wajib diisi."); return;
    }
    setBusy(true, "Menyimpan foto...");
    try {
      const blob = await getRenderedBlob();
      const store = $("editStore").value.trim();
      const sales = $("editSales").value.trim();
      const record = {
        id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        store, sales, location: currentVisit.location || "",
        date: currentVisit.date, time: currentVisit.time,
        createdAt: new Date().toISOString(), filename: filenameForVisit({ ...currentVisit, store, sales }),
        blob
      };
      await putPhoto(record);
      setBusy(false);
      showToast("Foto tersimpan di riwayat perangkat.");
      renderHistory();
    } catch (err) {
      setBusy(false);
      console.error(err);
      showToast("Foto tidak berhasil disimpan. Periksa ruang penyimpanan browser.");
    }
  }
  async function shareCurrentPhoto() {
    if (!$("editStore").value.trim() || !$("editSales").value.trim()) {
      showToast("Nama toko dan nama sales wajib diisi."); return;
    }
    try {
      const blob = await getRenderedBlob();
      const name = filenameForVisit({ ...currentVisit, store: $("editStore").value.trim(), sales: $("editSales").value.trim() });
      const file = new File([blob], name, { type: "image/jpeg" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `${$("editStore").value.trim()} - ${$("editSales").value.trim()}` });
        showToast("Menu berbagi telah dibuka.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast("Berbagi file tidak didukung browser ini. Foto diunduh; lampirkan ke WhatsApp.");
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.error(err);
      showToast("Foto belum dapat dibagikan. Coba simpan atau unduh foto.");
    }
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB tidak tersedia")); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("store", "store", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Database tidak dapat dibuka"));
    });
    return dbPromise;
  }
  async function putPhoto(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Gagal menyimpan"));
      tx.onabort = () => reject(tx.error || new Error("Penyimpanan dibatalkan"));
    });
  }
  async function getAllPhotos() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      req.onerror = () => reject(req.error || new Error("Gagal membaca riwayat"));
    });
  }
  async function getPhoto(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function deletePhoto(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function downloadRecord(record) {
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement("a"); a.href = url; a.download = record.filename || "foto-kunjungan.jpg";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function shareRecord(record) {
    const file = new File([record.blob], record.filename || "foto-kunjungan.jpg", { type: "image/jpeg" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: `${record.store} - ${record.sales}` }); }
      catch (err) { if (!err || err.name !== "AbortError") showToast("Tidak dapat membuka menu berbagi."); }
    } else {
      await downloadRecord(record);
      showToast("Foto diunduh. Lampirkan foto tersebut ke WhatsApp.");
    }
  }
  async function renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";
    try {
      const query = $("historySearch").value.trim().toLocaleLowerCase("id");
      const items = (await getAllPhotos()).filter(item => !query || (item.store || "").toLocaleLowerCase("id").includes(query) || (item.sales || "").toLocaleLowerCase("id").includes(query));
      $("historyEmpty").classList.toggle("show", items.length === 0);
      if (items.length === 0) {
        $("historyEmpty").querySelector("strong").textContent = query ? "Tidak ada foto yang cocok" : "Belum ada foto tersimpan";
        $("historyEmpty").querySelector("p").textContent = query ? "Coba kata kunci lain." : "Foto yang disimpan akan muncul di sini.";
        return;
      }
      items.forEach(item => {
        const row = document.createElement("article"); row.className = "history-item";
        const img = document.createElement("img"); img.className = "history-thumb"; img.alt = `Foto ${item.store}`;
        const url = URL.createObjectURL(item.blob); img.src = url; img.onload = () => URL.revokeObjectURL(url);
        const meta = document.createElement("div"); meta.className = "history-meta";
        const title = document.createElement("strong"); title.textContent = item.store || "Tanpa nama toko";
        const details = document.createElement("p"); details.textContent = `${item.sales || "—"}\n${formatDate(item.date)} • ${item.time || "—"}`;
        const actions = document.createElement("div"); actions.className = "history-actions";
        const download = document.createElement("button"); download.textContent = "Unduh"; download.addEventListener("click", () => downloadRecord(item));
        const share = document.createElement("button"); share.textContent = "Bagikan"; share.addEventListener("click", () => shareRecord(item));
        const del = document.createElement("button"); del.textContent = "Hapus"; del.className = "delete-history"; del.addEventListener("click", async () => {
          if (confirm(`Hapus foto kunjungan ${item.store || ""}?`)) {
            try { await deletePhoto(item.id); showToast("Foto dihapus dari riwayat."); renderHistory(); }
            catch (_) { showToast("Foto gagal dihapus."); }
          }
        });
        actions.append(download, share, del); meta.append(title, details, actions); row.append(img, meta); list.appendChild(row);
      });
    } catch (err) {
      console.error(err);
      $("historyEmpty").classList.add("show");
      $("historyEmpty").querySelector("strong").textContent = "Riwayat tidak dapat dibuka";
      $("historyEmpty").querySelector("p").textContent = "Browser mungkin tidak mendukung penyimpanan lokal.";
    }
  }
  function formatDate(value) {
    if (!value) return "Tanggal tidak tersedia";
    const parts = value.split("-");
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : value;
  }
  function submitVisit(event) {
    event.preventDefault();
    const store = $("storeName").value.trim();
    const sales = $("visitSales").value.trim();
    if (!store) { showToast("Nama toko wajib diisi."); $("storeName").focus(); return; }
    if (!sales) { showToast("Nama sales wajib diisi."); $("visitSales").focus(); return; }
    if (!$("visitDate").value || !$("visitTime").value) { showToast("Tanggal dan waktu harus diisi."); return; }
    currentVisit = {
      store, sales, location: $("visitLocation").value.trim(),
      date: $("visitDate").value, time: $("visitTime").value
    };
    $("cameraStoreLabel").textContent = store;
    showScreen("cameraScreen");
    startCamera();
  }
  function wireEvents() {
    $("settingsTopBtn").addEventListener("click", () => { loadSettings(); showScreen("settingsScreen"); });
    $("settingsBtn").addEventListener("click", () => { loadSettings(); showScreen("settingsScreen"); });
    $("editProfileBtn").addEventListener("click", () => { loadSettings(); showScreen("settingsScreen"); });
    $("startVisitBtn").addEventListener("click", openVisitForm);
    $("historyBtn").addEventListener("click", () => showScreen("historyScreen"));
    $("settingsForm").addEventListener("submit", saveSettings);
    $("visitForm").addEventListener("submit", submitVisit);
    $("getLocationBtn").addEventListener("click", getLocation);
    $("resetDateTimeBtn").addEventListener("click", () => { applyNowDateTime(); showToast("Tanggal dan waktu diperbarui."); });
    $("switchCameraBtn").addEventListener("click", switchCamera);
    $("takePhotoBtn").addEventListener("click", drawVideoToCanvas);
    $("uploadPhotoBtn").addEventListener("click", () => $("galleryInput").click());
    $("galleryInput").addEventListener("change", event => handleGalleryFile(event.target.files && event.target.files[0]));
    $("editStore").addEventListener("input", renderWatermark);
    $("editSales").addEventListener("input", renderWatermark);
    $("wmPosition").addEventListener("change", renderWatermark);
    $("wmStyle").addEventListener("change", renderWatermark);
    $("savePhotoBtn").addEventListener("click", savePhoto);
    $("sharePhotoBtn").addEventListener("click", shareCurrentPhoto);
    $("retakeBtn").addEventListener("click", () => { originalImage = null; originalBlob = null; showScreen("cameraScreen"); startCamera(); });
    $("historySearch").addEventListener("input", renderHistory);
    $("clearSearchBtn").addEventListener("click", () => { $("historySearch").value = ""; renderHistory(); });
    document.querySelectorAll("[data-back]").forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.back)));
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); });
    window.addEventListener("pagehide", stopCamera);
  }
  function registerServiceWorker() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("./service-worker.js").catch(err => console.warn("Service worker tidak terdaftar:", err));
    }
  }
  function init() {
    loadSettings();
    wireEvents();
    registerServiceWorker();
    if (!settings.sales) {
      $("settingSales").value = "";
      // Keep the home screen available; ask for profile when the user starts their first visit.
    }
  }
  init();
})();