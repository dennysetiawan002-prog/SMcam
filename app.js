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
    toastTimer = setTimeout(
      () => el.classList.remove("show"),
      duration
    );
  }

  function setBusy(on, message = "Memproses foto...") {
    $("busyText").textContent = message;
    $("busyOverlay").classList.toggle("hidden", !on);
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => {
      s.classList.toggle("active", s.id === id);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (id !== "cameraScreen") stopCamera();
    if (id === "historyScreen") renderHistory();
  }

  function loadSettings() {
    try {
      settings = {
        ...settings,
        ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"))
      };
    } catch (_) {
      settings = { sales: "", company: "" };
    }

    $("settingSales").value = settings.sales || "";
    $("settingCompany").value = settings.company || "";
    $("homeSalesName").textContent =
      settings.sales || "Atur nama sales";

    $("salesAvatar").textContent =
      (settings.sales || "S").trim().charAt(0).toUpperCase() || "S";
  }

  function saveSettings(event) {
    if (event) event.preventDefault();

    const sales = $("settingSales").value.trim();

    if (!sales) {
      showToast("Nama sales wajib diisi.");
      $("settingSales").focus();
      return;
    }

    settings = {
      sales,
      company: $("settingCompany").value.trim()
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );

    loadSettings();
    showToast("Pengaturan berhasil disimpan.");
    showScreen("homeScreen");
  }

  function localDateParts(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");

    return {
      date:
        `${date.getFullYear()}-` +
        `${pad(date.getMonth() + 1)}-` +
        `${pad(date.getDate())}`,

      time:
        `${pad(date.getHours())}:` +
        `${pad(date.getMinutes())}`
    };
  }

  function applyNowDateTime() {
    const now = localDateParts();

    $("visitDate").value = now.date;
    $("visitTime").value = now.time;
  }

  function getRecentStores() {
    return getAllPhotos().then(items => {
      const names = [
        ...new Set(items.map(x => x.store).filter(Boolean))
      ].sort((a, b) => a.localeCompare(b, "id"));

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

    $("gpsStatus").textContent =
      "Lokasi GPS akan ditampilkan pada watermark jika berhasil diperoleh.";

    applyNowDateTime();
    getRecentStores();
    showScreen("visitScreen");

    setTimeout(() => $("storeName").focus(), 200);
  }

  function getLocation() {
    if (!navigator.geolocation) {
      $("gpsStatus").textContent =
        "Browser tidak mendukung GPS. Isi lokasi secara manual.";

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

        $("gpsStatus").textContent =
          `GPS diperoleh (akurasi sekitar ${Math.round(pos.coords.accuracy)} meter). Lokasi akan ditampilkan pada watermark.`;

        $("getLocationBtn").disabled = false;
        $("getLocationBtn").textContent = "◎ Ambil GPS";

        showToast("Lokasi GPS berhasil diperoleh.");
      },

      err => {
        const message =
          err.code === 1
            ? "Izin lokasi ditolak."
            : err.code === 2
              ? "Lokasi tidak tersedia."
              : "Waktu mencari lokasi habis.";

        $("gpsStatus").textContent =
          `${message} Anda tetap dapat mengisi lokasi secara manual.`;

        $("getLocationBtn").disabled = false;
        $("getLocationBtn").textContent = "◎ Ambil GPS";

        showToast(message + " Silakan isi manual bila perlu.");
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000
      }
    );
  }

  function startCamera() {
    stopCamera();

    $("cameraError").classList.add("hidden");
    $("cameraPlaceholder").classList.remove("hidden");

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showCameraError(
        "Browser ini tidak mendukung kamera web. Buka aplikasi melalui HTTPS di browser modern seperti Chrome Android."
      );
      return;
    }

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    })
    .then(stream => {
      cameraStream = stream;

      const video = $("cameraVideo");
      video.srcObject = stream;
      video.classList.toggle(
        "mirrored",
        facingMode === "user"
      );

      const track = stream.getVideoTracks()[0];

      const actual =
        track && track.getSettings
          ? track.getSettings().facingMode
          : "";

      if (actual === "user") facingMode = "user";

      $("cameraPlaceholder").classList.add("hidden");

      return video.play().catch(() => {});
    })
    .catch(err => {
      let msg =
        "Kamera tidak dapat dibuka. Pastikan izin kamera diberikan dan tidak sedang dipakai aplikasi lain.";

      if (
        err &&
        (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        )
      ) {
        msg =
          "Izin kamera ditolak. Buka pengaturan izin situs di browser, lalu izinkan kamera.";
      } else if (
        err &&
        (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        )
      ) {
        msg = "Kamera tidak ditemukan pada perangkat ini.";
      } else if (err && err.name === "NotReadableError") {
        msg =
          "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
      }

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
    facingMode =
      facingMode === "environment"
        ? "user"
        : "environment";

    if (
      originalFromCamera &&
      $("previewScreen").classList.contains("active")
    ) {
      showScreen("cameraScreen");
    }

    startCamera();
  }

  function drawVideoToCanvas() {
    const video = $("cameraVideo");

    if (
      !cameraStream ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      showToast(
        "Kamera belum siap. Tunggu sebentar lalu coba lagi."
      );
      return;
    }

    const canvas = $("captureCanvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d", { alpha: false });

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(blob => {
      if (!blob) {
        showToast("Foto gagal diproses. Silakan coba lagi.");
        return;
      }

      originalBlob = blob;
      originalFromCamera = true;

      loadImageFromBlob(blob)
        .then(img => {
          originalImage = img;
          stopCamera();
          openPreview();
        })
        .catch(() => {
          showToast("Foto gagal dibuka. Silakan coba lagi.");
        });
    }, "image/jpeg", 0.94);
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Gagal memuat gambar"));
      };

      img.src = url;
    });
  }

  function handleGalleryFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Pilih file gambar yang valid.");
      return;
    }

    setBusy(true, "Membuka foto...");

    originalBlob = file;
    originalFromCamera = false;

    loadImageFromBlob(file)
      .then(img => {
        originalImage = img;
        setBusy(false);
        openPreview();
      })
      .catch(() => {
        setBusy(false);
        showToast("Foto dari galeri tidak dapat dibuka.");
      });

    $("galleryInput").value = "";
  }

  function openPreview() {
    $("editStore").value = currentVisit.store || "";
    $("editSales").value = currentVisit.sales || "";
    $("editCompany").value = settings.company || "";
    $("editLocation").value = currentVisit.location || "";
    $("editDate").value =
      currentVisit.date || localDateParts().date;
    $("editTime").value =
      currentVisit.time || localDateParts().time;

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

    while (
      ctx.measureText(text).width > maxWidth &&
      size > 12
    ) {
      size--;
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
    }

    return size;
  }

  // =========================================================
  // WATERMARK PROFESIONAL
  // Jam digital, tanggal, perusahaan, toko, sales, dan GPS.
  // =========================================================

  function renderWatermark() {
    if (!originalImage) return;

    const canvas = $("watermarkCanvas");
    const maxSide = 2560;

    const iw =
      originalImage.naturalWidth || originalImage.width;

    const ih =
      originalImage.naturalHeight || originalImage.height;

    const scale = Math.min(
      1,
      maxSide / Math.max(iw, ih)
    );

    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", { alpha: false });

    // Selalu mulai dari foto asli agar watermark tidak bertumpuk.
    ctx.drawImage(originalImage, 0, 0, w, h);

    const store =
      $("editStore").value.trim() || "Nama Toko";

    const sales =
      $("editSales").value.trim() || "Nama Sales";

    const company =
      $("editCompany").value.trim();

    const locationText =
      $("editLocation").value.trim() ||
      "Lokasi tidak tersedia";

    const dateValue = $("editDate").value;
    const timeValue = $("editTime").value;

    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu"
    ];

    let dateText = "Tanggal tidak tersedia";

    if (dateValue) {
      const d = new Date(dateValue + "T12:00:00");

      dateText =
        `${dateValue.slice(8, 10)}-` +
        `${dateValue.slice(5, 7)}-` +
        `${dateValue.slice(0, 4)} ` +
        `${days[d.getDay()]}`;
    }

    let timeText = "--:--:--";

    if (timeValue) {
      const parts = timeValue.split(":");

      timeText =
        `${parts[0] || "00"}:` +
        `${parts[1] || "00"}:` +
        `${parts[2] || "00"}`;
    }

    const unit = Math.min(w, h);
    const pad = Math.max(12, Math.round(unit * 0.027));

    const titleSize = Math.max(
      22,
      Math.round(unit * 0.045)
    );

    const bodySize = Math.max(
      16,
      Math.round(unit * 0.027)
    );

    const smallSize = Math.max(
      14,
      Math.round(unit * 0.022)
    );

    const dateSize = Math.max(
      20,
      Math.round(unit * 0.034)
    );

    const tileH = Math.max(
      42,
      Math.round(unit * 0.075)
    );

    const gap = Math.max(
      5,
      Math.round(unit * 0.008)
    );

    const lineHeight = Math.max(
      bodySize * 1.42,
      smallSize * 1.42
    );

    const separatorHeight = Math.max(
      4,
      Math.round(unit * 0.006)
    );

    const lines = [];

    if (company) {
      lines.push({
        text: company,
        size: bodySize,
        weight: 700
      });
    }

    lines.push({
      text: store.toUpperCase(),
      size: titleSize,
      weight: 800
    });

    lines.push({
      text: `Sales: ${sales}`,
      size: bodySize,
      weight: 600
    });

    lines.push({
      text: `⌖ ${locationText}`,
      size: smallSize,
      weight: 600
    });

    const boxH =
      pad * 1.5 +
      tileH +
      gap +
      dateSize * 1.35 +
      gap +
      separatorHeight +
      gap +
      lines.length * lineHeight +
      pad;

    const margin = pad;
    const boxX = margin;
    const boxW = w - margin * 2;

    const boxY =
      $("wmPosition").value === "top"
        ? margin
        : Math.max(margin, h - boxH - margin);

    const light = $("wmStyle").value === "light";

    ctx.save();

    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = Math.max(5, unit * 0.01);

    ctx.fillStyle = light
      ? "rgba(255,255,255,0.88)"
      : "rgba(18,31,49,0.72)";

    roundRect(
      ctx,
      boxX,
      boxY,
      boxW,
      Math.min(boxH, h - margin * 2),
      Math.max(10, unit * 0.014)
    );

    ctx.fill();
    ctx.shadowColor = "transparent";

    const tx = boxX + pad * 0.65;
    const maxTextW = boxW - pad * 1.3;

    let cy = boxY + pad * 0.55;

    // Jam digital dalam kotak.
    const parts = timeText.split(":");

    ctx.textBaseline = "middle";
    ctx.font = `800 ${titleSize}px Arial, sans-serif`;

    let tileX = tx;

    parts.forEach((part, index) => {
      const textWidth = ctx.measureText(part).width;

      const tileW = Math.max(
        titleSize * 1.45,
        textWidth + pad * 0.65
      );

      ctx.fillStyle = light
        ? "rgba(48,67,95,0.92)"
        : "rgba(75,96,130,0.92)";

      roundRect(
        ctx,
        tileX,
        cy,
        tileW,
        tileH,
        Math.max(5, unit * 0.006)
      );

      ctx.fill();

      ctx.fillStyle = "#ffffff";

      ctx.fillText(
        part,
        tileX + (tileW - textWidth) / 2,
        cy + tileH / 2
      );

      tileX += tileW;

      if (index < parts.length - 1) {
        ctx.fillStyle = light ? "#26384d" : "#ffffff";

        ctx.fillText(
          ":",
          tileX + gap * 0.25,
          cy + tileH / 2
        );

        tileX += titleSize * 0.35;
      }

      tileX += gap;
    });

    cy += tileH + gap;

    // Tanggal dan hari.
    ctx.fillStyle = light ? "#172b40" : "#ffffff";
    ctx.textBaseline = "top";

    let ds = dateSize;
    ctx.font = `800 ${ds}px Arial, sans-serif`;

    while (
      ctx.measureText(dateText).width > maxTextW &&
      ds > 14
    ) {
      ds--;
      ctx.font = `800 ${ds}px Arial, sans-serif`;
    }

    ctx.fillText(dateText, tx, cy, maxTextW);

    cy += dateSize * 1.35;

    // Garis kuning profesional.
    ctx.fillStyle = "#f4c21b";

    ctx.fillRect(
      tx,
      cy,
      maxTextW,
      separatorHeight
    );

    cy += separatorHeight + gap;

    // Perusahaan, toko, sales, dan lokasi.
    lines.forEach(line => {
      let fs = line.size;

      ctx.font =
        `${line.weight} ${fs}px Arial, sans-serif`;

      while (
        ctx.measureText(line.text).width > maxTextW &&
        fs > 12
      ) {
        fs--;
        ctx.font =
          `${line.weight} ${fs}px Arial, sans-serif`;
      }

      ctx.fillStyle = light
        ? "#26384d"
        : "rgba(255,255,255,0.97)";

      ctx.textBaseline = "top";

      ctx.fillText(
        line.text,
        tx,
        cy,
        maxTextW
      );

      cy += lineHeight;
    });

    ctx.restore();

    renderedBlob = null;
  }

  function getRenderedBlob() {
    return new Promise((resolve, reject) => {
      const canvas = $("watermarkCanvas");

      canvas.toBlob(
        blob => {
          if (blob) {
            renderedBlob = blob;
            resolve(blob);
          } else {
            reject(new Error("Gagal mengekspor foto"));
          }
        },
        "image/jpeg",
        0.94
      );
    });
  }

  function safeFilePart(value) {
    return (value || "toko")
      .normalize("NFKD")
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 55) || "toko";
  }

  function filenameForVisit(visit) {
    const d = (
      visit.date || localDateParts().date
    ).replace(/-/g, "");

    const t = (
      visit.time || localDateParts().time
    ).replace(/:/g, "");

    return `${d}_${safeFilePart(visit.store)}_${t}.jpg`;
  }

  async function downloadCurrentPhoto() {
    const blob = await getRenderedBlob();

    const name = filenameForVisit({
      ...currentVisit,
      store: $("editStore").value.trim(),
      sales: $("editSales").value.trim(),
      date: $("editDate").value,
      time: $("editTime").value
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

    return { blob, name };
  }

  async function savePhoto() {
    if (
      !$("editStore").value.trim() ||
      !$("editSales").value.trim()
    ) {
      showToast("Nama toko dan nama sales wajib diisi.");
      return;
    }

    setBusy(true, "Menyimpan foto...");

    try {
      const blob = await getRenderedBlob();

      const store = $("editStore").value.trim();
      const sales = $("editSales").value.trim();

      const record = {
        id: (
          crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`
        ),

        store,
        sales,
        company: $("editCompany").value.trim(),
        location: $("editLocation").value.trim(),
        date: $("editDate").value,
        time: $("editTime").value,
        createdAt: new Date().toISOString(),

        filename: filenameForVisit({
          ...currentVisit,
          store,
          sales,
          date: $("editDate").value,
          time: $("editTime").value
        }),

        blob
      };

      await putPhoto(record);

      setBusy(false);

      showToast("Foto tersimpan di riwayat perangkat.");
      renderHistory();
    } catch (err) {
      setBusy(false);
      console.error(err);

      showToast(
        "Foto tidak berhasil disimpan. Periksa ruang penyimpanan browser."
      );
    }
  }

  async function shareCurrentPhoto() {
    if (
      !$("editStore").value.trim() ||
      !$("editSales").value.trim()
    ) {
      showToast("Nama toko dan nama sales wajib diisi.");
      return;
    }

    try {
      const blob = await getRenderedBlob();

      const name = filenameForVisit({
        ...currentVisit,
        store: $("editStore").value.trim(),
        sales: $("editSales").value.trim(),
        date: $("editDate").value,
        time: $("editTime").value
      });

      const file = new File(
        [blob],
        name,
        { type: "image/jpeg" }
      );

      if (
        navigator.share &&
        (
          !navigator.canShare ||
          navigator.canShare({ files: [file] })
        )
      ) {
        await navigator.share({
          files: [file],
          title:
            `${$("editStore").value.trim()} - ` +
            `${$("editSales").value.trim()}`
        });

        showToast("Menu berbagi telah dibuka.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = name;

        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1500);

        showToast(
          "Berbagi file tidak didukung browser ini. Foto diunduh; lampirkan ke WhatsApp."
        );
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;

      console.error(err);

      showToast(
        "Foto belum dapat dibagikan. Coba simpan atau unduh foto."
      );
    }
  }

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB tidak tersedia"));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(
            STORE_NAME,
            { keyPath: "id" }
          );

          store.createIndex(
            "createdAt",
            "createdAt",
            { unique: false }
          );

          store.createIndex(
            "store",
            "store",
            { unique: false }
          );
        }
      };

      req.onsuccess = () => resolve(req.result);

      req.onerror = () => reject(
        req.error || new Error("Database tidak dapat dibuka")
      );
    });

    return dbPromise;
  }

  async function putPhoto(record) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).put(record);

      tx.oncomplete = () => resolve();

      tx.onerror = () => reject(
        tx.error || new Error("Gagal menyimpan")
      );

      tx.onabort = () => reject(
        tx.error || new Error("Penyimpanan dibatalkan")
      );
    });
  }

  async function getAllPhotos() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .getAll();

      req.onsuccess = () => resolve(
        (req.result || []).sort(
          (a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
        )
      );

      req.onerror = () => reject(
        req.error || new Error("Gagal membaca riwayat")
      );
    });
  }

  async function getPhoto(id) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(id);

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
    const a = document.createElement("a");

    a.href = url;
    a.download = record.filename || "foto-kunjungan.jpg";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function shareRecord(record) {
    const file = new File(
      [record.blob],
      record.filename || "foto-kunjungan.jpg",
      { type: "image/jpeg" }
    );

    if (
      navigator.share &&
      (
        !navigator.canShare ||
        navigator.canShare({ files: [file] })
      )
    ) {
      try {
        await navigator.share({
          files: [file],
          title: `${record.store} - ${record.sales}`
        });
      } catch (err) {
        if (!err || err.name !== "AbortError") {
          showToast("Tidak dapat membuka menu berbagi.");
        }
      }
    } else {
      await downloadRecord(record);
      showToast(
        "Foto diunduh. Lampirkan foto tersebut ke WhatsApp."
      );
    }
  }

  async function renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";

    try {
      const query = $("historySearch")
        .value.trim().toLocaleLowerCase("id");

      const items = (await getAllPhotos()).filter(item =>
        !query ||
        (item.store || "")
          .toLocaleLowerCase("id")
          .includes(query) ||
        (item.sales || "")
          .toLocaleLowerCase("id")
          .includes(query)
      );

      $("historyEmpty").classList.toggle(
        "show",
        items.length === 0
      );

      if (items.length === 0) {
        $("historyEmpty").querySelector("strong").textContent =
          query
            ? "Tidak ada foto yang cocok"
            : "Belum ada foto tersimpan";

        $("historyEmpty").querySelector("p").textContent =
          query
            ? "Coba kata kunci lain."
            : "Foto yang disimpan akan muncul di sini.";

        return;
      }

      items.forEach(item => {
        const row = document.createElement("article");
        row.className = "history-item";

        const img = document.createElement("img");
        img.className = "history-thumb";
        img.alt = `Foto ${item.store}`;

        const url = URL.createObjectURL(item.blob);
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);

        const meta = document.createElement("div");
        meta.className = "history-meta";

        const title = document.createElement("strong");
        title.textContent = item.store || "Tanpa nama toko";

        const details = document.createElement("p");
        details.textContent =
          `${item.sales || "—"}\n` +
          `${formatDate(item.date)} • ${item.time || "—"}`;

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const download = document.createElement("button");
        download.textContent = "Unduh";
        download.addEventListener(
          "click",
          () => downloadRecord(item)
        );

        const share = document.createElement("button");
        share.textContent = "Bagikan";
        share.addEventListener(
          "click",
          () => shareRecord(item)
        );

        const del = document.createElement("button");
        del.textContent = "Hapus";
        del.className = "delete-history";

        del.addEventListener("click", async () => {
          if (
            confirm(`Hapus foto kunjungan ${item.store || ""}?`)
          ) {
            try {
              await deletePhoto(item.id);
              showToast("Foto dihapus dari riwayat.");
              renderHistory();
            } catch (_) {
              showToast("Foto gagal dihapus.");
            }
          }
        });

        actions.append(download, share, del);
        meta.append(title, details, actions);
        row.append(img, meta);
        list.appendChild(row);
      });
    } catch (err) {
      console.error(err);

      $("historyEmpty").classList.add("show");

      $("historyEmpty").querySelector("strong").textContent =
        "Riwayat tidak dapat dibuka";

      $("historyEmpty").querySelector("p").textContent =
        "Browser mungkin tidak mendukung penyimpanan lokal.";
    }
  }

  function formatDate(value) {
    if (!value) return "Tanggal tidak tersedia";

    const parts = value.split("-");

    return parts.length === 3
      ? `${parts[2]}-${parts[1]}-${parts[0]}`
      : value;
  }

  function submitVisit(event) {
    event.preventDefault();

    const store = $("storeName").value.trim();
    const sales = $("visitSales").value.trim();

    if (!store) {
      showToast("Nama toko wajib diisi.");
      $("storeName").focus();
      return;
    }

    if (!sales) {
      showToast("Nama sales wajib diisi.");
      $("visitSales").focus();
      return;
    }

    if (!$("visitDate").value || !$("visitTime").value) {
      showToast("Tanggal dan waktu harus diisi.");
      return;
    }

    currentVisit = {
      store,
      sales,
      location: $("visitLocation").value.trim(),
      date: $("visitDate").value,
      time: $("visitTime").value
    };

    $("cameraStoreLabel").textContent = store;

    showScreen("cameraScreen");
    startCamera();
  }

  function wireEvents() {
    $("settingsTopBtn").addEventListener("click", () => {
      loadSettings();
      showScreen("settingsScreen");
    });

    $("settingsBtn").addEventListener("click", () => {
      loadSettings();
      showScreen("settingsScreen");
    });

    $("editProfileBtn").addEventListener("click", () => {
      loadSettings();
      showScreen("settingsScreen");
    });

    $("startVisitBtn").addEventListener(
      "click",
      openVisitForm
    );

    $("historyBtn").addEventListener("click", () => {
      showScreen("historyScreen");
    });

    $("settingsForm").addEventListener(
      "submit",
      saveSettings
    );

    $("visitForm").addEventListener(
      "submit",
      submitVisit
    );

    $("getLocationBtn").addEventListener(
      "click",
      getLocation
    );

    $("resetDateTimeBtn").addEventListener("click", () => {
      applyNowDateTime();
      showToast("Tanggal dan waktu diperbarui.");
    });

    $("switchCameraBtn").addEventListener(
      "click",
      switchCamera
    );

    $("takePhotoBtn").addEventListener(
      "click",
      drawVideoToCanvas
    );

    $("uploadPhotoBtn").addEventListener("click", () => {
      $("galleryInput").click();
    });

    $("galleryInput").addEventListener("change", event => {
      handleGalleryFile(
        event.target.files && event.target.files[0]
      );
    });

    [
      "editStore",
      "editSales",
      "editCompany",
      "editLocation",
      "editDate",
      "editTime"
    ].forEach(id => {
      $(id).addEventListener("input", () => {
        if (currentVisit) {
          currentVisit.store = $("editStore").value.trim();
          currentVisit.sales = $("editSales").value.trim();
          currentVisit.location = $("editLocation").value.trim();
          currentVisit.date = $("editDate").value;
          currentVisit.time = $("editTime").value;
        }

        renderWatermark();
      });

      $(id).addEventListener(
        "change",
        renderWatermark
      );
    });

    $("wmPosition").addEventListener(
      "change",
      renderWatermark
    );

    $("wmStyle").addEventListener(
      "change",
      renderWatermark
    );

    $("savePhotoBtn").addEventListener(
      "click",
      savePhoto
    );

    $("sharePhotoBtn").addEventListener(
      "click",
      shareCurrentPhoto
    );

    $("retakeBtn").addEventListener("click", () => {
      originalImage = null;
      originalBlob = null;

      showScreen("cameraScreen");
      startCamera();
    });

    $("historySearch").addEventListener(
      "input",
      renderHistory
    );

    $("clearSearchBtn").addEventListener("click", () => {
      $("historySearch").value = "";
      renderHistory();
    });

    document.querySelectorAll("[data-back]").forEach(btn => {
      btn.addEventListener("click", () => {
        showScreen(btn.dataset.back);
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopCamera();
    });

    window.addEventListener("pagehide", stopCamera);
  }

  function registerServiceWorker() {
    if (
      "serviceWorker" in navigator &&
      (
        location.protocol === "https:" ||
        location.hostname === "localhost"
      )
    ) {
      navigator.serviceWorker
        .register("./service-worker.js")
        .catch(err => {
          console.warn(
            "Service worker tidak terdaftar:",
            err
          );
        });
    }
  }

  function init() {
    loadSettings();
    wireEvents();
    registerServiceWorker();

    if (!settings.sales) {
      $("settingSales").value = "";
    }
  }

  init();
})();
