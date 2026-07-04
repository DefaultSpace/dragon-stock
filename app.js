/* ═══════════════════════════════════════════════════════════════════
   Stok Takip — Dragon Evolution v3.5 (Master Edition)
   - Integrated Web Audio API Sound FX System (No external files needed)
   - Enhanced Barcode/QR Laser Scanning & State Management
   - Fixed all known edge cases, duplicate listeners, and optimized loops
   ═══════════════════════════════════════════════════════════════════ */

const STORAGE_KEY  = "shadowStockSystem.v3";
const DAY_MS       = 24 * 60 * 60 * 1000;
const THREE_DAYS   = 3 * DAY_MS;

/* Durum anahtarları eski kayıtlarla uyum için aynı kaldı;
   "warranty" artık garantili değişimden çıkan eski parçanın
   ertesi gün depoya verilmesi gereken "Arızalı İade" durumu. */
const stateLabels = {
  active: "Aktif",
  warranty: "Arızalı İade",
  ypa: "YPA",
  safeReturn: "Sağlam İade",
  history: "Geçmiş"
};

const columns = [
  { key: "active",     title: "Aktif Stok",   hint: "Araçtaki / elimdeki parçalar" },
  { key: "warranty",   title: "Arızalı İade", hint: "Garantili değişim — ertesi gün depoya" },
  { key: "ypa",        title: "YPA Acil",     hint: "Kırık/arızalı geldi — 24 saat içinde depoya" },
  { key: "safeReturn", title: "Sağlam İade",  hint: "Kullanılmadı — depoya geri verilecek" },
  { key: "history",    title: "Geçmiş",       hint: "Kapanan işlemler" }
];

const activeStates = ["active", "warranty", "ypa", "safeReturn"];

const DRAGON_STAGES = [
  { id: "egg",        name: "🥚 Ejderha Yumurtası",  minLevel: 0,  emoji: "🥚", desc: "İçinden bir ejderha çıkacak! İş yaptıkça çatlayacak..." },
  { id: "hatchling",  name: "🐣 Minik Ejderha",       minLevel: 3,  emoji: "🐣", desc: "Yumurtadan çıktı! Küçük kanatları var." },
  { id: "young",      name: "🐉 Genç Ejderha",        minLevel: 6,  emoji: "🐉", desc: "Kanatları güçlendi, alev püskürtüyor!" },
  { id: "adult",      name: "🐲 Yetişkin Ejderha",     minLevel: 10, emoji: "🐲", desc: "Gökyüzünde süzülüyor, alevleri cehennem sıcağı." },
  { id: "ancient",    name: "⚡ Efsanevi Ejderha",    minLevel: 16, emoji: "⚡", desc: "Zamanın başlangıcından beri var." }
];

// Pure Web Audio Synth Sound FX Generator
const sfx = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Mobil tarayıcılar AudioContext'i askıya alabilir; kullanıcı etkileşiminde devam ettir
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  },
  play(type) {
    vibrate({ click: 8, success: [15, 30, 15], laser: [30, 50, 30], levelUp: [40, 60, 40, 60, 80] }[type] || 8);
    if (app && app.settings && app.settings.sound === false) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;

      if (type === "click") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
      } else if (type === "success") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.08);
        osc.frequency.setValueAtTime(900, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      } else if (type === "laser") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
      } else if (type === "levelUp") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
      }
    } catch (e) { console.warn("Sfx play error:", e); }
  }
};

function getDragonStage(level) {
  let stage = DRAGON_STAGES[0];
  for (const s of DRAGON_STAGES) {
    if (level >= s.minLevel) stage = s;
  }
  return stage;
}

const els = {};
let app, activeFilter = "all", searchTerm = "", deferredInstallPrompt = null;
let selectMode = false;
const selected = new Set();

document.addEventListener("DOMContentLoaded", () => {
  requestPersistentStorage();
  cacheEls();
  registerSW();
  bindEvents();
  resetDaily();
  evalPenalties();
  checkWeekly();
  render();
  particleCanvas();
  setInterval(tickCD, 1000);
  initOffline();
  detectIOS();
  checkBackup();
  updateDragonVisual();
  morningCheck();
  setupPeriodicReminder();
  updateMetaCache();
});

function cacheEls() {
  const $ = id => document.querySelector(id);
  Object.assign(els, {
    sc: $("#stockColumns"), pf: $("#partForm"), pi: $("#partInput"), pn: $("#partNoteInput"),
    si: $("#searchInput"), im: $("#inputMessage"), tc: $("#toastContainer"), xf: $("#xpFloatLayer"),
    ad: $("#auditDialog"), acl: $("#auditChecklist"), asu: $("#auditSummary"),
    wd: $("#weeklyDialog"), wcl: $("#weeklyChecklist"), wsu: $("#weeklySummary"), wb: $("#weeklyBadge"),
    sd: $("#statsDialog"), nd: $("#notifDialog"), scd: $("#scannerDialog"), imp: $("#importInput"),
    ib: $("#installBtn"),
    ac: $("#activeCount"), wc: $("#warrantyCount"), yc: $("#ypaCount"), src: $("#safeReturnCount"),
    dn: $("#dragonName"), dxf: $("#dragonExpFill"), dxt: $("#dragonExpText"), dlv: $("#dragonLv"),
    de: $("#dragonEmoji"), dd: $("#dragonDesc"), dg: $("#dragonGlow"), ds: $("#dragonScene"),
    dfb: $("#dragonFireBurst"),
    sdn: $("#dDialogName"), sl: $("#dialogLevel"), sde: $("#dDialogEmoji"), sdd: $("#dDialogDesc"),
    stTotal: $("#statTotal"), stActive: $("#statActive"), stPending: $("#statPending"),
    stDelivered: $("#statDelivered"), stCatalog: $("#statCatalog"),
    stStreak: $("#statStreak"), stBest: $("#statBest"),
    hl: $("#headerLevel"), hs: $("#headerStreak"),
    dueBar: $("#dueBar"), undoBar: $("#undoBar"), undoMsg: $("#undoMsg"), undoBtn: $("#undoBtn"),
    quickCodes: $("#quickCodes"),
    selectToggle: $("#selectToggle"), bulkBar: $("#bulkBar"), bulkCount: $("#bulkCount"),
    bulkDeliver: $("#bulkDeliver"), bulkDelete: $("#bulkDelete"), bulkCancel: $("#bulkCancel"),
    editName: $("#editDragonName"),
    qtyInput: $("#qtyInput"),
    sv: $("#scannerVideo"), stip: $("#scannerTip")
  });
}

function bindEvents() {
  if (els.pf) {
    els.pf.addEventListener("submit", e => {
      e.preventDefault();
      const qty = els.qtyInput ? Math.max(1, parseInt(els.qtyInput.value, 10) || 1) : 1;
      addPart(els.pi.value, els.pn?.value?.trim() || "", qty);
      if (els.qtyInput) els.qtyInput.value = "1";
    });
  }

  const qtyDec = document.querySelector("#qtyDec");
  const qtyInc = document.querySelector("#qtyInc");
  const setQty = d => {
    if (!els.qtyInput) return;
    els.qtyInput.value = String(Math.max(1, (parseInt(els.qtyInput.value, 10) || 1) + d));
    sfx.play("click");
  };
  if (qtyDec) qtyDec.addEventListener("click", () => setQty(-1));
  if (qtyInc) qtyInc.addEventListener("click", () => setQty(1));
  
  if (els.pi) {
    els.pi.addEventListener("input", () => {
      els.pi.value = els.pi.value.replace(/\D/g, "").slice(0, 8);
      // Parça hafızası: kod tamamlanınca adı otomatik doldur
      if (els.pi.value.length === 8 && els.pn) {
        const known = app.catalog[els.pi.value];
        if (known && !els.pn.value.trim()) {
          els.pn.value = known;
          flash(`💡 Hafızadan bulundu: ${known}`);
        }
      }
    });
  }

  if (els.si) {
    els.si.addEventListener("input", () => { 
      searchTerm = els.si.value.trim().toLowerCase(); 
      renderStock(); 
    });
  }
  
  const clearSearchBtn = document.querySelector("#clearSearchBtn");
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => { 
      sfx.play("click");
      searchTerm = ""; 
      if (els.si) els.si.value = ""; 
      renderStock(); 
    });
  }

  const scanBtn = document.querySelector("#scanBtn");
  if (scanBtn && els.scd) {
    scanBtn.addEventListener("click", () => {
      sfx.play("click");
      els.scd.showModal();
      startScanner();
    });
    els.scd.addEventListener("close", stopScanner);
  }

  document.querySelectorAll("[data-complete-quest]").forEach(b => {
    b.addEventListener("click", () => {
      const k = b.dataset.completeQuest;
      if (app.quests.completed[k]) { flash("Bu görev bugün tamamlandı. 🎉"); return; }
      flash(k === "stockEntry"
        ? "Bu görev stok girişi yapınca otomatik tamamlanır."
        : "Bu görev bir iade parçasını depoya teslim edince tamamlanır.");
    });
  });

  document.querySelectorAll(".f-chip").forEach(t => {
    t.addEventListener("click", () => {
      sfx.play("click");
      setFilter(t.dataset.filter);
    });
  });
  
  document.querySelectorAll("[data-filter-shortcut]").forEach(t => {
    t.addEventListener("click", () => {
      sfx.play("click");
      setFilter(t.dataset.filterShortcut);
    });
  });

  const auditBtn = document.querySelector("#auditBtn");
  if (auditBtn) auditBtn.addEventListener("click", () => { sfx.play("click"); openAudit(); });
  
  const auditMatch = document.querySelector("#auditMatch");
  if (auditMatch) auditMatch.addEventListener("click", () => { sfx.play("success"); completeAudit(); });
  
  const auditMismatch = document.querySelector("#auditMismatch");
  if (auditMismatch && els.ad) {
    auditMismatch.addEventListener("click", () => { 
      sfx.play("click");
      app.penaltyActive = true; 
      els.ad.close(); 
      err("Eksik/Fazla kaydedildi."); 
      save(); 
      render(); 
    });
  }

  const weeklyCountBtn = document.querySelector("#weeklyCountBtn");
  if (weeklyCountBtn) weeklyCountBtn.addEventListener("click", () => { sfx.play("click"); openWeekly(); });
  
  const weeklyCountMatch = document.querySelector("#weeklyCountMatch");
  if (weeklyCountMatch) weeklyCountMatch.addEventListener("click", () => { sfx.play("success"); completeWeekly(); });
  
  const weeklyCountClose = document.querySelector("#weeklyCountClose");
  if (weeklyCountClose && els.wd) weeklyCountClose.addEventListener("click", () => els.wd.close());

  const statsBtn = document.querySelector("#statsBtn");
  if (statsBtn) statsBtn.addEventListener("click", () => { sfx.play("click"); openStats(); });
  if (els.ds) els.ds.addEventListener("click", () => { sfx.play("click"); openStats(); });

  if (els.undoBtn) els.undoBtn.addEventListener("click", doUndo);

  if (els.editName) els.editName.addEventListener("click", editDragonName);

  if (els.selectToggle) els.selectToggle.addEventListener("click", () => { sfx.play("click"); setSelectMode(!selectMode); });
  if (els.bulkDeliver) els.bulkDeliver.addEventListener("click", () => { sfx.play("success"); bulkDeliver(); });
  if (els.bulkDelete) els.bulkDelete.addEventListener("click", bulkDelete);
  if (els.bulkCancel) els.bulkCancel.addEventListener("click", () => { sfx.play("click"); setSelectMode(false); });

  const notifBtn = document.querySelector("#notifBtn");
  if (notifBtn && els.nd) {
    notifBtn.addEventListener("click", () => {
      sfx.play("click");
      syncSettingsUI();
      els.nd.showModal();
    });
  }

  // Ayarlar: ses / titreşim / bildirim anahtarları
  const setSound = document.querySelector("#setSound");
  if (setSound) {
    setSound.addEventListener("change", () => {
      app.settings.sound = setSound.checked;
      save();
      if (setSound.checked) sfx.play("click");
      flash(setSound.checked ? "🔊 Sesler açık." : "🔇 Sesler kapalı.");
    });
  }

  const setVibration = document.querySelector("#setVibration");
  if (setVibration) {
    setVibration.addEventListener("change", () => {
      app.settings.vibration = setVibration.checked;
      save();
      if (setVibration.checked) vibrate([20, 40, 20]);
      flash(setVibration.checked ? "📳 Titreşim açık." : "Titreşim kapalı.");
    });
  }

  const setNotif = document.querySelector("#setNotif");
  if (setNotif) {
    setNotif.addEventListener("change", async () => {
      if (setNotif.checked) {
        if (!("Notification" in window)) {
          setNotif.checked = false;
          err("Bu tarayıcı bildirimleri desteklemiyor.");
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setNotif.checked = false;
          err("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.");
          app.settings.notifications = false;
          save();
          return;
        }
        app.settings.notifications = true;
        save();
        toast("🔔 Bildirimler açık — her sabah 09:00'dan sonra hatırlatılacak.", "success");
        checkReturnReminders();
        setupPeriodicReminder();
      } else {
        app.settings.notifications = false;
        save();
        flash("Bildirimler kapatıldı.");
      }
    });
  }

  const resetAppBtn = document.querySelector("#resetAppBtn");
  if (resetAppBtn) {
    resetAppBtn.addEventListener("click", () => {
      if (!confirm("TÜM veriler silinecek: parçalar, seviye ve parça hafızası.\n\nDevam edilsin mi?")) return;
      if (!confirm("Son onay: Bu işlem GERİ ALINAMAZ. Yedek almadıysan iptal et.\n\nHer şey silinsin mi?")) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BK_KEY);
      location.reload();
    });
  }

  const exportBtn = document.querySelector("#exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => { sfx.play("success"); exportJson(); });

  const shareBtn = document.querySelector("#shareBtn");
  if (shareBtn) shareBtn.addEventListener("click", () => { sfx.play("click"); shareReturnList(); });

  const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      const n = app.parts.filter(p => p.state === "history").length;
      if (!n) { flash("Temizlenecek kayıt yok."); return; }
      if (!confirm(`${n} arşiv kaydı kalıcı olarak silinecek. Emin misin?`)) return;
      app.parts = app.parts.filter(p => p.state !== "history");
      vibrate([20, 40, 20]);
      saveMsg(`${n} kayıt temizlendi.`);
    });
  }

  if (els.imp) els.imp.addEventListener("change", importJson);

  window.addEventListener("beforeinstallprompt", e => { 
    e.preventDefault(); 
    deferredInstallPrompt = e; 
    if (els.ib) els.ib.classList.remove("hidden"); 
  });
  
  if (els.ib) {
    els.ib.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        // iOS'ta kurulum istemi yok — kullanıcıya yolu göster
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
          toast("📲 Kurulum: Safari'de Paylaş (⬆) → \"Ana Ekrana Ekle\"", "info", 8000);
        }
        return;
      }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      els.ib.classList.add("hidden");
    });
  }

  // Arka planda bekleyen PWA sabah tekrar öne gelince gün dönümünü işle
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    resetDaily();
    evalPenalties();
    checkWeekly();
    render();
    morningCheck();
  });
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./service-worker.js"); } catch(e) {}
  }
}

/* Kalıcı Depolama: tarayıcının arka planda kapatınca localStorage'ı
   silmesini engeller. İzin verilmezse veriler bellek baskısında uçabilir.
   Bu, "uygulamayı kapatınca kodlar sıfırlanıyor" sorununun asıl çözümü. */
async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    const already = await navigator.storage.persisted();
    if (already) return;
    await navigator.storage.persist();
  } catch (e) {}
}

/* DİKKAT: AUTO_NOTES, loadState()'ten ÖNCE tanımlanmalı.
   normalize() bu sabiti kullanır; sonra tanımlanırsa açılışta
   ReferenceError oluşur ve tüm kayıtlar boş durumla değiştirilirdi. */
const AUTO_NOTES = ["Barkod Tarayıcı İle Eklendi", "Barkod ile okutuldu"];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = initState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    return normalize(JSON.parse(raw));
  } catch(e) {
    console.error("Durum yüklenemedi, yedek durum kullanılıyor:", e);
    // Bozuk/okunamayan veriyi kurtarma anahtarına taşı — üzerine yazılıp kaybolmasın
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY + ".rescue", raw);
    } catch (_) {}
    return initState();
  }
}
app = loadState();

function initState() {
  return {
    profile: { name: "Hüseyin Emrehan", level: 1, exp: 0 },
    streak: { count: 0, lastDay: null, best: 0 },
    quests: { date: todayKey(), completed: {} },
    penaltyActive: false,
    weeklyCount: { lastDoneAt: null, weekKey: null },
    settings: { sound: true, vibration: true, notifications: false },
    catalog: {},
    usage: {},
    parts: []
  };
}

function normalize(d) {
  const p = d.profile || {};
  const st = d.settings || {};
  const streakIn = d.streak || {};
  const state = {
    profile: { name: p.name || "Hüseyin Emrehan", level: +p.level || 1, exp: +p.exp || 0, dragonName: (p.dragonName || "").toString().slice(0, 24) },
    streak: { count: +streakIn.count || 0, lastDay: streakIn.lastDay || null, best: +streakIn.best || 0 },
    quests: d.quests || { date: todayKey(), completed: {} },
    penaltyActive: !!d.penaltyActive,
    weeklyCount: d.weeklyCount || { lastDoneAt: null, weekKey: null },
    settings: {
      sound: st.sound !== false,
      vibration: st.vibration !== false,
      notifications: st.notifications === true
    },
    catalog: (d.catalog && typeof d.catalog === "object") ? d.catalog : {},
    usage: (d.usage && typeof d.usage === "object") ? d.usage : {},
    parts: Array.isArray(d.parts) ? d.parts.map(normalizePart).filter(Boolean) : []
  };
  // Parça hafızasını eski kayıtlardaki notlardan da besle
  for (const part of state.parts) {
    if (part.note && !AUTO_NOTES.includes(part.note) && !state.catalog[part.code]) {
      state.catalog[part.code] = part.note;
    }
  }
  return state;
}

function normalizePart(p) {
  if (!p || !/^\d{8}$/.test("" + p.code)) return null;
  return {
    id: p.id || id(),
    code: "" + p.code,
    note: p.note || "",
    qty: Math.max(1, Math.floor(+p.qty || 1)),
    state: stateLabels[p.state] ? p.state : "active",
    createdAt: +p.createdAt || Date.now(),
    timestamps: p.timestamps || { acquiredAt: Date.now() },
    history: Array.isArray(p.history) ? p.history : []
  };
}

function mkPart(code, state, createdAt, note, qty) {
  const p = { id: id(), code, note, qty: Math.max(1, Math.floor(+qty || 1)), state, createdAt, timestamps: { acquiredAt: createdAt }, history: [{ state, at: createdAt }] };
  if (state === "warranty") p.timestamps.mountedAt = createdAt + 3600000;
  if (state === "ypa") p.timestamps.ypaStartedAt = createdAt;
  if (state === "safeReturn") p.timestamps.returnDecisionAt = createdAt;
  return p;
}

function addPart(val, note, qty) {
  const code = ("" + val).trim();
  if (!/^\d{8}$/.test(code)) { flash("BSH kodu 8 rakam olmalı.", true); return; }
  const amount = Math.max(1, Math.floor(+qty || 1));

  // Parça hafızası: not girilmediyse hafızadan al, girildiyse hafızayı güncelle
  let finalNote = (note || "").trim();
  if (!finalNote && app.catalog[code]) {
    finalNote = app.catalog[code];
  } else if (finalNote && !AUTO_NOTES.includes(finalNote)) {
    app.catalog[code] = finalNote;
  }

  // Aynı kod zaten AKTİF stoktaysa: yeni kart açma, adedi artır
  const activeDup = app.parts.find(p => p.code === code && p.state === "active");
  if (activeDup) {
    activeDup.qty = (activeDup.qty || 1) + amount;
    bumpUsage(code, amount);
    sfx.play("success");
    award(20, "Stok girişi");
    autoQuest("stockEntry");
    if (els.pi) { els.pi.value = ""; els.pi.focus(); }
    if (els.pn) els.pn.value = "";
    save(); flash(`${code} adedi ${activeDup.qty} oldu (+${amount}).`); render();
    floatXP(`+${amount} adet`, els.pi);
    return;
  }

  // Kod iade/geçmiş dışı başka bir durumda varsa uyar ve oraya götür
  const dup = app.parts.find(p => p.code === code && p.state !== "history");
  if (dup) {
    setFilter(dup.state);
    searchTerm = code;
    if (els.si) els.si.value = code;
    flash(`${code} zaten ${stateLabels[dup.state]} listesinde.`, true);
    return;
  }

  sfx.play("success");
  app.parts.unshift(mkPart(code, "active", Date.now(), finalNote, amount));
  bumpUsage(code, amount);
  award(20, "Stok girişi");
  autoQuest("stockEntry");
  if (els.pi) { els.pi.value = ""; els.pi.focus(); }
  if (els.pn) els.pn.value = "";
  save(); flash(`${code}${finalNote ? " · " + finalNote : ""}${amount > 1 ? " ×" + amount : ""} eklendi.`); render();

  const card = document.querySelector(`[data-card-id="${app.parts[0].id}"]`);
  if (card) {
    card.classList.add("just-added");
    setTimeout(() => card.classList.remove("just-added"), 1200);
  }
  floatXP("+20 EXP", els.pi);
}

/* Sık kullanılan parça paneli için kod kullanım sayacı */
function bumpUsage(code, amount) {
  app.usage = app.usage || {};
  app.usage[code] = (app.usage[code] || 0) + (amount || 1);
}

/* Karttaki +/- ile adet değiştir (en az 1) */
function changeQty(id, delta) {
  const p = findP(id); if (!p) return;
  const next = Math.max(1, (p.qty || 1) + delta);
  if (next === p.qty) return;
  p.qty = next;
  sfx.play("click");
  vibrate(8);
  save(); render();
}

/* ─── Sık Kullanılan Parçalar paneli ─── */
function renderQuickCodes() {
  if (!els.quickCodes) return;
  const entries = Object.entries(app.usage || {})
    .filter(([c]) => /^\d{8}$/.test(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (!entries.length) { els.quickCodes.classList.add("hidden"); els.quickCodes.innerHTML = ""; return; }
  const chips = entries.map(([code, cnt]) => {
    const name = app.catalog[code] || "";
    return `<button type="button" class="quick-chip" data-quick="${code}" title="${esc(name)} · ${cnt} kez eklendi"><span class="qc-code">${code}</span>${name ? `<span class="qc-name">${esc(name)}</span>` : ""}</button>`;
  }).join("");
  els.quickCodes.innerHTML = `<div class="qc-head">⚡ Sık Kullanılanlar</div><div class="qc-chips">${chips}</div>`;
  els.quickCodes.classList.remove("hidden");
  els.quickCodes.querySelectorAll("[data-quick]").forEach(b =>
    b.addEventListener("click", () => addPart(b.dataset.quick)));
}

/* ─── Çoklu seçim & toplu işlem ─── */
function setSelectMode(on) {
  selectMode = on;
  selected.clear();
  syncSelectUI();
  render();
}
function syncSelectUI() {
  if (els.selectToggle) {
    els.selectToggle.classList.toggle("active", selectMode);
    els.selectToggle.textContent = selectMode ? "✖ Vazgeç" : "☑️ Seç";
  }
  updateBulkBar();
}
function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  sfx.play("click");
  vibrate(8);
  const card = document.querySelector(`[data-select-id="${id}"]`);
  if (card) card.classList.toggle("selected", selected.has(id));
  updateBulkBar();
}
function updateBulkBar() {
  if (!els.bulkBar) return;
  if (!selectMode || selected.size === 0) { els.bulkBar.classList.add("hidden"); return; }
  if (els.bulkCount) els.bulkCount.textContent = `Seçili: ${selected.size}`;
  els.bulkBar.classList.remove("hidden");
}
function bulkDeliver() {
  const targets = [...selected].map(findP).filter(p => p && ["warranty", "ypa", "safeReturn"].includes(p.state));
  if (!targets.length) { flash("Seçili iade parçası yok — sadece iade bekleyenler teslim edilir.", true); return; }
  const before = snapshotParts();
  const now = Date.now();
  targets.forEach(p => {
    p.timestamps.warehouseDeliveredAt = now;
    p.history.push({ state: "warehouseDelivered", at: now });
    p.state = "history";
  });
  award(120, "Toplu depo teslimi");
  const n = targets.length;
  selectMode = false; selected.clear(); syncSelectUI();
  saveMsg(`${n} parça depoya teslim edildi. ✅`);
  offerUndo(`${n} parça teslim edildi.`, before);
}
function bulkDelete() {
  if (!selected.size) return;
  if (!confirm(`${selected.size} parça silinsin mi?\n\n(Parça hafızasındaki adları korunur.)`)) return;
  const before = snapshotParts();
  const n = selected.size;
  app.parts = app.parts.filter(p => !selected.has(p.id));
  selectMode = false; selected.clear(); syncSelectUI();
  vibrate([20, 40, 20]);
  saveMsg(`${n} parça silindi.`);
  offerUndo(`${n} parça silindi.`, before);
}

/* ─── Ejderhaya isim verme ─── */
function editDragonName() {
  const cur = app.profile.dragonName || "";
  const v = prompt("Ejderhana bir isim ver (boş bırakırsan kaldırılır):", cur);
  if (v === null) return;
  app.profile.dragonName = v.trim().slice(0, 24);
  save();
  updateDragonVisual();
  const stage = getDragonStage(app.profile.level);
  if (els.sdn) els.sdn.textContent = app.profile.dragonName || stage.name;
  flash(app.profile.dragonName ? `Ejderhanın adı: ${app.profile.dragonName} 🐉` : "İsim kaldırıldı.");
}

/* Tarama sonrası doğrulama: okunan kod direkt eklenmez.
   Kod (ve varsa hafızadaki adı) gösterilip onay istenir. */
function confirmAndAdd(code) {
  const c = ("" + code).trim();
  if (els.pi) els.pi.value = c;
  const typed = els.pn?.value?.trim() || "";
  const known = app.catalog[c];
  if (els.pn && known && !typed) els.pn.value = known;
  const shown = typed || known || "";
  const label = shown ? `${c} — ${shown}` : c;
  if (confirm(`Okunan kod:\n\n${label}\n\nBu kod doğru mu? Listeye eklensin mi?`)) {
    addPart(c, els.pn?.value?.trim() || "");
  } else {
    flash("Ekleme iptal edildi. Kodu elle kontrol edip ekleyebilirsin.", true);
    if (els.pi) els.pi.focus();
  }
}

function changeState(id, next) {
  sfx.play("click");
  const p = findP(id); if (!p) return;
  const before = snapshotParts();
  const card = document.querySelector(`[data-card-id="${id}"]`);
  if (card) card.classList.add("state-changing");
  const prev = p.state;
  const now = Date.now(); p.state = next; p.history.push({ state: next, at: now });
  if (next === "active") p.timestamps.acquiredAt ||= now;
  if (next === "warranty") p.timestamps.mountedAt = now;
  if (next === "history") p.timestamps.archivedAt = now;
  if (next === "ypa") p.timestamps.ypaStartedAt = now;
  if (next === "safeReturn") p.timestamps.returnDecisionAt = now;

  const r = {
    warranty: { e: 45 },
    history: { e: 80 },
    ypa: { e: 25 },
    safeReturn: { e: 35 },
    active: { e: 10 }
  }[next];

  if (r) award(r.e || 0, "Durum değişikliği");

  const msg = {
    warranty: `${p.code} takıldı — eski parçayı YARIN depoya ver (Arızalı İade).`,
    ypa: `${p.code} YPA listesinde — 24 saat içinde depoya.`,
    safeReturn: `${p.code} sağlam iade listesinde — depoya geri ver.`,
    active: `${p.code} aktif stoğa alındı.`,
    history: prev === "active"
      ? `${p.code} kapatıldı — eski parça müşteride kaldı, stoktan düştü.`
      : `${p.code} arşive taşındı.`
  }[next] || `${p.code} güncellendi.`;

  saveMsg(msg);
  offerUndo(msg, before);
  if (r?.e && card) floatXP(`+${r.e} EXP`, card);
}

function deliverToWH(id) {
  const p = findP(id); if (!p) return;
  const prev = p.state;
  const card = document.querySelector(`[data-card-id="${id}"]`);
  if (card) {
    card.classList.add("delivering");
    setTimeout(() => finishDeliver(id, prev), 520);
    return;
  }
  finishDeliver(id, prev);
}

function finishDeliver(id, prev) {
  const p = findP(id); if (!p) return;
  const now = Date.now();
  p.timestamps.warehouseDeliveredAt = now;
  p.history.push({ state: "warehouseDelivered", at: now });
  p.state = "history";
  award(prev === "ypa" ? 180 : 120, "Depo teslimi");
  if (prev === "ypa" || prev === "warranty") autoQuest("ypaHunter");
  saveMsg(`${p.code} depoya teslim edildi. ✅`);
}

/* Depoya iade için son teslim zamanı:
   - Arızalı İade (garantili değişim): takıldığı günün ERTESİ günü 23:59
   - YPA: başlangıçtan itibaren 24 saat */
function returnDeadline(p) {
  if (p.state === "ypa") return (p.timestamps.ypaStartedAt || p.createdAt) + DAY_MS;
  if (p.state === "warranty") {
    const m = new Date(p.timestamps.mountedAt || p.createdAt);
    return new Date(m.getFullYear(), m.getMonth(), m.getDate() + 1, 23, 59, 59).getTime();
  }
  return null;
}

function award(exp, reason) {
  const before = app.profile.level, beforeStage = getDragonStage(before).id;
  app.profile.exp += exp || 0;

  while (app.profile.exp >= expNeed(app.profile.level)) {
    app.profile.exp -= expNeed(app.profile.level);
    app.profile.level++;
  }

  bumpStreak();

  const afterStage = getDragonStage(app.profile.level).id;
  if (app.profile.level > before) showLevelUp();
  if (afterStage !== beforeStage) triggerEvo(beforeStage, afterStage);
  updateDragonVisual();
}

/* Günlük seri: her verimli iş yapıldığında çağrılır.
   Aynı gün tekrar çağrılırsa değişmez; dünden devamsa +1;
   bir günden fazla boşluk varsa 1'e sıfırlanır. */
function bumpStreak() {
  app.streak = app.streak || { count: 0, lastDay: null, best: 0 };
  const today = todayKey();
  if (app.streak.lastDay === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  app.streak.count = app.streak.lastDay === yesterday ? app.streak.count + 1 : 1;
  app.streak.lastDay = today;
  if (app.streak.count > (app.streak.best || 0)) app.streak.best = app.streak.count;
  updateStreakUI();
  if (app.streak.count >= 2) toast(`🔥 ${app.streak.count} günlük seri!`, "success", 3500);
}

function updateStreakUI() {
  if (!els.hs) return;
  const c = (app.streak && app.streak.count) || 0;
  els.hs.textContent = `🔥 ${c}`;
  els.hs.classList.toggle("hidden", c < 1);
}

function expNeed(l) { return 100 + (l - 1) * 55; }

function updateDragonVisual() {
  if (!els.dn) return;
  const stage = getDragonStage(app.profile.level), need = expNeed(app.profile.level), pct = Math.min(100, Math.round((app.profile.exp / need) * 100));
  els.dn.textContent = app.profile.dragonName || stage.name;
  els.dxf.style.width = `${pct}%`;
  els.dxt.textContent = `${app.profile.exp}/${need}`;
  els.dlv.textContent = `Lv.${app.profile.level}`;
  if (els.hl) els.hl.textContent = `Lv.${app.profile.level}`;
  els.de.textContent = stage.emoji;
  els.dd.textContent = stage.desc;
  els.ds.className = `dragon-scene stage-${stage.id}`;
}

function triggerEvo(from, to) {
  sfx.play("levelUp");
  if (els.ds) els.ds.classList.add("dragon-evolving");
  toast(`⚡ EVOLUTION! ${getDragonStage(app.profile.level).name}`, "success", 4000);
  setTimeout(() => { 
    updateDragonVisual(); 
    if (els.ds) els.ds.classList.remove("dragon-evolving"); 
  }, 700);
}

function showLevelUp() {
  sfx.play("levelUp");
  toast(`⬆ Level ${app.profile.level}!`, "success", 5000);
}

/* Görevler gerçek işlerle otomatik tamamlanır:
   stockEntry → gün içinde ilk stok girişi
   ypaHunter  → bir iade parçasının depoya teslimi */
function autoQuest(key) {
  if (app.quests.completed[key]) return;
  const r = { stockEntry: { e: 50 }, ypaHunter: { e: 150 } }[key];
  app.quests.completed[key] = true;
  if (r) award(r.e, "Görev");
  sfx.play("success");
  toast(`🎯 Görev tamamlandı! +${r.e} EXP`, "success", 4000);
  renderQuests();
}

function openAudit() {
  if (!els.asu || !els.acl || !els.ad) return;
  const parts = app.parts.filter(p => activeStates.includes(p.state));
  els.asu.textContent = `${parts.length} parça sayılacak.`;
  els.acl.innerHTML = parts.length ? parts.map(p => `<label class="audit-item"><span><strong>${p.code}</strong><small>${stateLabels[p.state]}${p.note ? " · " + esc(p.note) : ""}</small></span><input type="checkbox" /></label>`).join("") : '<div class="empty-state">Sayılacak parça yok.</div>';
  els.ad.showModal();
}

function completeAudit() {
  if (!els.acl || !els.ad) return;
  const cbs = els.acl.querySelectorAll("input[type='checkbox']");
  if (cbs.length > 0 && !Array.from(cbs).every(c => c.checked)) { 
    toast("❌ Tüm parçaları işaretle.", "error", 5000); 
    return; 
  }
  app.penaltyActive = false;
  award(220, "Sayım");
  els.ad.close(); 
  saveMsg("Kusursuz sayım! ✅");
}

function getWeekKey() { 
  const d = new Date(), s = new Date(d.getFullYear(), 0, 1); 
  return `${d.getFullYear()}-W${String(Math.ceil(((d - s) / DAY_MS + s.getDay() + 1) / 7)).padStart(2, "0")}`; 
}
function isWeeklyDue() { return (app.weeklyCount || {}).weekKey !== getWeekKey(); }
function checkWeekly() {
  if (!isWeeklyDue() || !app.parts.filter(p => activeStates.includes(p.state)).length) return;
  updateWBadge();
}
function updateWBadge() { 
  if (els.wb) els.wb.classList.toggle("hidden", !isWeeklyDue()); 
}
function openWeekly() {
  if (!els.wsu || !els.wcl || !els.wd) return;
  const parts = app.parts.filter(p => activeStates.includes(p.state));
  els.wsu.textContent = `${parts.length} parçayı doğrula.`;
  els.wcl.innerHTML = parts.length ? parts.map(p => `<label class="audit-item"><span><strong>${p.code}</strong><small>${stateLabels[p.state]}${p.note ? " · " + esc(p.note) : ""}</small></span><input type="checkbox" /></label>`).join("") : '<div class="empty-state">Sayım gerekmez.</div>';
  els.wd.showModal();
}
function completeWeekly() {
  if (!els.wcl || !els.wd) return;
  const cbs = els.wcl.querySelectorAll("input[type='checkbox']");
  if (cbs.length > 0 && !Array.from(cbs).every(c => c.checked)) { 
    toast("❌ Tüm parçaları işaretle.", "error", 5000); 
    return; 
  }
  app.weeklyCount = { lastDoneAt: Date.now(), weekKey: getWeekKey() };
  award(300, "Haftalık sayım");
  els.wd.close(); 
  updateWBadge(); 
  saveMsg("✅ Haftalık sayım tamam!");
}

function evalPenalties() {
  const now = Date.now(), was = app.penaltyActive;
  app.penaltyActive = app.penaltyActive || app.parts.some(p => {
    const dl = returnDeadline(p);
    return dl !== null && now > dl;
  });
  if (app.penaltyActive !== was) save();
}

function resetDaily() {
  if (app.quests.date === todayKey()) return;
  app.quests = { date: todayKey(), completed: {} };
  save();
}

function openStats() {
  if (!els.sd) return;
  const stage = getDragonStage(app.profile.level);
  if (els.sde) els.sde.textContent = stage.emoji;
  if (els.sdn) els.sdn.textContent = app.profile.dragonName || stage.name;
  if (els.sdd) els.sdd.textContent = stage.desc;

  const c = counts();
  const pending = c.warranty + c.ypa + c.safeReturn;
  const delivered = app.parts.filter(p => p.timestamps && p.timestamps.warehouseDeliveredAt).length;
  const catalogSize = Object.keys(app.catalog || {}).length;

  if (els.sl) els.sl.textContent = app.profile.level;
  if (els.stTotal) els.stTotal.textContent = app.parts.length;
  if (els.stActive) els.stActive.textContent = c.active;
  if (els.stPending) els.stPending.textContent = pending;
  if (els.stDelivered) els.stDelivered.textContent = delivered;
  if (els.stCatalog) els.stCatalog.textContent = catalogSize;
  if (els.stStreak) els.stStreak.textContent = (app.streak && app.streak.count) || 0;
  if (els.stBest) els.stBest.textContent = (app.streak && app.streak.best) || 0;
  els.sd.showModal();
}

function render() {
  updateDragonVisual();
  updateStreakUI();
  renderQuests();
  renderQuickCodes();
  renderDueBar();
  renderStock();
  updateWBadge();
}

/* Bugün / gecikmiş iade paneli: teslim süresi 24 saatten az kalan
   veya süresi geçmiş parçaları en üstte toplar. */
function renderDueBar() {
  if (!els.dueBar) return;
  const now = Date.now();
  const items = app.parts
    .filter(p => ["warranty", "ypa", "safeReturn"].includes(p.state))
    .map(p => ({ p, dl: returnDeadline(p) }))
    .filter(x => x.dl !== null)
    .filter(x => x.dl - now < DAY_MS) // 24 saatten az kaldı ya da geçti
    .sort((a, b) => a.dl - b.dl);

  if (!items.length) { els.dueBar.classList.add("hidden"); els.dueBar.innerHTML = ""; return; }

  const overdue = items.filter(x => x.dl < now).length;
  const head = overdue
    ? `⚠️ ${overdue} parça GECİKTİ — hemen depoya!`
    : `⏰ ${items.length} parça bugün teslim edilmeli`;
  const chips = items.map(({ p, dl }) => {
    const late = dl < now;
    const name = p.note || app.catalog[p.code] || stateLabels[p.state];
    return `<button class="due-chip ${late ? "late" : ""}" data-due-jump="${p.state}" title="${esc(name)}">${p.code} · ${late ? "GECİKTİ" : fmtCD(p)}</button>`;
  }).join("");
  els.dueBar.innerHTML = `<div class="due-head">${head}</div><div class="due-chips">${chips}</div>`;
  els.dueBar.classList.remove("hidden");
  els.dueBar.querySelectorAll("[data-due-jump]").forEach(b =>
    b.addEventListener("click", () => { sfx.play("click"); setFilter(b.dataset.dueJump); }));
}

/* ─── Geri Al (Undo) ─── */
let pendingUndo = null, undoTimer = null;
function offerUndo(msg, beforeParts) {
  pendingUndo = beforeParts;
  if (!els.undoBar || !els.undoMsg) return;
  els.undoMsg.textContent = msg;
  els.undoBar.classList.remove("hidden");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 6000);
}
function hideUndo() {
  pendingUndo = null;
  if (els.undoBar) els.undoBar.classList.add("hidden");
}
function doUndo() {
  if (!pendingUndo) return;
  app.parts = pendingUndo;
  pendingUndo = null;
  hideUndo();
  sfx.play("click");
  saveMsg("↩ İşlem geri alındı.");
}
function snapshotParts() { return JSON.parse(JSON.stringify(app.parts)); }

function renderQuests() {
  document.querySelectorAll("[data-complete-quest]").forEach(b => {
    const k = b.dataset.completeQuest, done = !!app.quests.completed[k];
    const btn = b.closest(".daily-btn");
    btn?.classList.toggle("done", done);
    const icon = btn?.querySelector(".quest-status-icon");
    if (icon) icon.textContent = done ? "✅" : "🔒";
  });
}

function renderStock() {
  if (!els.sc) return;
  els.sc.classList.toggle("select-mode", selectMode);
  const visible = activeFilter === "all" ? columns : columns.filter(c => c.key === activeFilter);
  els.sc.innerHTML = visible.map(col => {
    const items = app.parts.filter(p => p.state === col.key).filter(matchSearch);
    const units = items.reduce((s, p) => s + (p.qty || 1), 0);
    return `<section class="stock-column"><div class="column-head"><div><h3>${col.title}</h3><small>${col.hint}</small></div><span class="column-count">${units}</span></div><div class="part-list">${items.length ? items.map(renderCard).join("") : `<div class="empty-state">${emptyTxt(col.key)}</div>`}</div></section>`;
  }).join("");

  if (selectMode) {
    els.sc.querySelectorAll("[data-select-id]").forEach(c => c.addEventListener("click", () => toggleSelect(c.dataset.selectId)));
  } else {
    els.sc.querySelectorAll("[data-state]").forEach(b => b.addEventListener("click", () => changeState(b.dataset.id, b.dataset.state)));
    els.sc.querySelectorAll("[data-deliver]").forEach(b => b.addEventListener("click", () => deliverToWH(b.dataset.deliver)));
    els.sc.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deletePart(b.dataset.delete)));
    els.sc.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => copyCode(b.dataset.copy)));
    els.sc.querySelectorAll("[data-qty-inc]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.qtyInc, 1)));
    els.sc.querySelectorAll("[data-qty-dec]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.qtyDec, -1)));
  }
  updateSummary();
}

function updateSummary() {
  const c = counts();
  if (els.ac) els.ac.textContent = c.active;
  if (els.wc) els.wc.textContent = c.warranty;
  if (els.yc) els.yc.textContent = c.ypa;
  if (els.src) els.src.textContent = c.safeReturn;
}

function renderCard(p) {
  const meta = [
    ["Alınma", p.timestamps.acquiredAt], 
    ["Montaj", p.timestamps.mountedAt], 
    ["YPA", p.timestamps.ypaStartedAt], 
    ["İade", p.timestamps.returnDecisionAt], 
    ["Teslim", p.timestamps.warehouseDeliveredAt], 
    ["Arşiv", p.timestamps.archivedAt]
  ].filter(([, v]) => v);
  
  const name = p.note || app.catalog[p.code] || "";
  const showCD = p.state === "ypa" || p.state === "warranty";
  const qty = p.qty || 1;
  const sel = selected.has(p.id) ? " selected" : "";
  const qtyBadge = qty > 1 ? `<span class="qty-badge">×${qty}</span>` : "";
  const stepper = p.state !== "history"
    ? `<div class="qty-stepper"><button type="button" data-qty-dec="${p.id}" aria-label="Adet azalt">−</button><span class="qty-val">${qty} adet</span><button type="button" data-qty-inc="${p.id}" aria-label="Adet artır">+</button></div>`
    : "";
  return `<article class="part-card ${p.state}${sel}" data-card-id="${p.id}" data-select-id="${p.id}"><span class="select-tick">✓</span><div class="part-head"><div><span class="part-code">${p.code}</span>${qtyBadge}${name ? `<span class="part-name">${esc(name)}</span>` : ""}<small>${fmtDate(p.createdAt)}</small></div><span class="state-pill">${stateLabels[p.state]}</span></div><div class="meta-list">${meta.map(([l, v]) => `<span>${l}: <b>${fmtDate(v)}</b></span>`).join("")}</div>${showCD ? `<div class="countdown" data-cd="${p.id}">${fmtCD(p)}</div>` : ""}<div class="card-bottom">${stepper}<div class="card-actions">${renderActs(p)}</div></div></article>`;
}

/* İş akışı butonları:
   Aktif parça → nasıl kullanıldığını seç
   İade bekleyen parça → depoya teslim et / geri al */
function renderActs(p) {
  const acts = [`<button data-copy="${p.code}">📋 Kod</button>`];
  if (p.state === "active") {
    acts.push(`<button data-id="${p.id}" data-state="warranty" class="act-warn">🔧 Garantili Takıldı</button>`);
    acts.push(`<button data-id="${p.id}" data-state="history" class="act-close">💰 Garanti Harici Takıldı</button>`);
    acts.push(`<button data-id="${p.id}" data-state="ypa" class="act-ypa">📦 Kırık / Arızalı Geldi</button>`);
    acts.push(`<button data-id="${p.id}" data-state="safeReturn" class="act-safe">↩ Kullanmadım</button>`);
  } else if (["warranty", "ypa", "safeReturn"].includes(p.state)) {
    acts.push(`<button data-deliver="${p.id}">🚛 Depoya Teslim</button>`);
    acts.push(`<button data-id="${p.id}" data-state="active">↺ Geri Al</button>`);
  } else if (p.state === "history") {
    acts.push(`<button data-id="${p.id}" data-state="active">↺ Stoğa Geri Al</button>`);
  }
  acts.push(`<button data-delete="${p.id}" class="act-delete">🗑️ Sil</button>`);
  return acts.join("");
}

function deletePart(id) {
  const p = findP(id); if (!p) return;
  if (!confirm(`${p.code}${p.note ? " · " + p.note : ""} silinsin mi?\n\nBu parça listeden tamamen kaldırılacak. (Parça hafızasındaki adı korunur.)`)) return;
  const before = snapshotParts();
  app.parts = app.parts.filter(x => x.id !== id);
  vibrate([20, 40, 20]);
  sfx.play("click");
  saveMsg(`${p.code} silindi.`);
  offerUndo(`${p.code} silindi.`, before);
}

function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll(".f-chip").forEach(t => t.classList.toggle("active", t.dataset.filter === f));
  if (els.sc) {
    els.sc.classList.add("filtering");
    setTimeout(() => { 
      renderStock(); 
      requestAnimationFrame(() => els.sc.classList.remove("filtering")); 
    }, 150);
  }
}

function matchSearch(p) {
  if (!searchTerm) return true;
  return [p.code, p.note || "", stateLabels[p.state], fmtDate(p.createdAt)].join(" ").toLowerCase().includes(searchTerm);
}

function counts() {
  return app.parts.reduce((c, p) => { c[p.state] = (c[p.state] || 0) + (p.qty || 1); return c; }, { active: 0, warranty: 0, ypa: 0, safeReturn: 0, history: 0 });
}
function emptyTxt(k) { 
  if (searchTerm) return "Eşleşen yok."; 
  return "Liste boş."; 
}

function tickCD() {
  document.querySelectorAll("[data-cd]").forEach(n => {
    const p = findP(n.dataset.cd); if (!p) return;
    n.textContent = fmtCD(p);
    const dl = returnDeadline(p);
    if (dl === null) return;
    const r = dl - Date.now();
    n.classList.toggle("hot", r > 0 && r < 3600000);
    n.classList.toggle("overdue", r <= 0);
  });
}
function fmtCD(p) {
  const dl = returnDeadline(p);
  if (dl === null) return "";
  const r = dl - Date.now();
  if (r <= 0) return "⚠️ GECİKTİ — hemen depoya!";
  const h = Math.floor(r / 3600000);
  return `⏱ ${pad(h)}:${pad(Math.floor((r % 3600000) / 60000))}:${pad(Math.floor((r % 60000) / 1000))} kaldı`;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
  updateMetaCache(); // SW'nin sabah hatırlatıcısı için iade sayısını güncelle
}
function saveMsg(m) { save(); flash(m); render(); }
function flash(m, e) { 
  if (!els.im) return; 
  els.im.textContent = m; 
  els.im.style.color = e ? "var(--red)" : "var(--gold)"; 
  clearTimeout(flash._t); 
  flash._t = setTimeout(() => els.im.textContent = "", 3000); 
}
function toast(m, t, d) {
  if (!els.tc) return;
  const el = document.createElement("div");
  el.className = `toast toast-${t || "info"}`; el.textContent = m;
  els.tc.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-show"));
  setTimeout(() => { el.remove(); }, d || 4000);
}
function err(m) { toast(m, "error", 5000); }

function floatXP(t, a) {
  if (!els.xf || !t) return;
  const r = a?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2 };
  const n = document.createElement("span");
  n.className = "xp-float"; n.textContent = t;
  n.style.left = `${r.left}px`; n.style.top = `${r.top}px`;
  els.xf.appendChild(n);
  n.addEventListener("animationend", () => n.remove());
}
function findP(id) { return app.parts.find(p => p.id === id); }
function todayKey() { 
  const d = new Date(); 
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; 
}
function fmtDate(v) { 
  return v ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : ""; 
}
function pad(n) { return String(n).padStart(2, "0"); }
function id() { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9); }
function esc(s) { 
  const d = document.createElement("div"); 
  d.appendChild(document.createTextNode(s)); 
  return d.innerHTML; 
}

/* İade bekleyen parçaların listesini paylaş (WhatsApp/SMS vb.)
   Web Share API yoksa panoya kopyalanır. */
async function shareReturnList() {
  const due = app.parts.filter(p => ["warranty", "ypa", "safeReturn"].includes(p.state));
  if (!due.length) { flash("Paylaşılacak iade parçası yok — liste temiz. ✅"); return; }
  const now = Date.now();
  const lines = due.map(p => {
    const dl = returnDeadline(p);
    const late = dl !== null && now > dl;
    const name = p.note || app.catalog[p.code] || "";
    return `• ${p.code}${name ? " — " + name : ""} (${stateLabels[p.state]})${late ? " ⚠️ GECİKTİ" : ""}`;
  });
  const text = `📦 Depoya İade Listesi — ${fmtDate(now)}\n${lines.join("\n")}\nToplam: ${due.length} parça`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Depoya İade Listesi", text });
      flash("Liste paylaşıldı. 📨");
    } else {
      await navigator.clipboard.writeText(text);
      toast("📋 Liste panoya kopyalandı — istediğin yere yapıştır.", "success");
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // kullanıcı paylaşımı iptal etti
    try {
      await navigator.clipboard.writeText(text);
      toast("📋 Liste panoya kopyalandı.", "success");
    } catch (_) { err("Paylaşım desteklenmiyor."); }
  }
}

async function copyCode(c) {
  try { 
    await navigator.clipboard.writeText(c); 
    flash(`${c} kopyalandı.`); 
  } catch(e) { 
    flash("Kopyalama desteklenmiyor.", true); 
  }
}

function exportJson() {
  const b = new Blob([JSON.stringify({ appState: app }, null, 2)], { type: "application/json" });
  const u = URL.createObjectURL(b), a = document.createElement("a");
  a.href = u; a.download = `ejderha-stok-${todayKey()}.json`; a.click(); markBackupDone();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
  toast("📤 Yedek indirildi. Dosyayı güvenli bir yerde sakla.", "success");
}

async function importJson(e) {
  const [f] = e.target.files; if (!f) return;
  e.target.value = ""; // aynı dosya tekrar seçilebilsin
  try {
    const t = await f.text(), d = JSON.parse(t);
    const incoming = normalize(d.appState || d);
    const curN = app.parts.length, inN = incoming.parts.length;
    if (!confirm(`Yedek yüklenecek: ${inN} parça, Lv.${incoming.profile.level}.\n\nMevcut veriler (${curN} parça, Lv.${app.profile.level}) ÜZERİNE YAZILACAK.\n\nDevam edilsin mi?`)) {
      flash("Yükleme iptal edildi.");
      return;
    }
    app = incoming;
    saveMsg("✅ Veriler başarıyla aktarıldı.");
    updateDragonVisual();
  } catch(err) { flash("Dosya okunamadı — geçerli bir yedek dosyası seç.", true); }
}

function vibrate(pattern) {
  if (app && app.settings && app.settings.vibration === false) return;
  try { navigator.vibrate?.(pattern); } catch (e) {}
}

/* ─── Gerçek Kamera Barkod Tarayıcı (Android Chrome — BarcodeDetector) ─── */
let scanStream = null, scanLoopId = null;

async function startScanner() {
  if (!els.sv) return;
  const tip = t => { if (els.stip) els.stip.textContent = t; };

  if (!navigator.mediaDevices?.getUserMedia) {
    tip("Bu tarayıcı kamerayı desteklemiyor — elle simüle edebilirsin.");
    return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    els.sv.srcObject = scanStream;
    await els.sv.play();
  } catch (e) {
    tip("Kamera izni verilmedi. Elle simüle edebilirsin.");
    return;
  }

  if (!("BarcodeDetector" in window)) {
    tip("Barkod algılama desteklenmiyor — kodu elle gir.");
    return;
  }

  tip("Kamerayı parça üzerindeki barkoda hizalayın");
  const detector = new BarcodeDetector({
    formats: ["ean_13", "ean_8", "code_128", "code_39", "itf", "upc_a", "upc_e", "qr_code", "data_matrix"]
  });

  const loop = async () => {
    if (!scanStream) return;
    try {
      const codes = await detector.detect(els.sv);
      for (const c of codes) {
        const digits = (c.rawValue.match(/\d{8}/) || [])[0];
        if (digits) {
          sfx.play("laser");
          els.scd.close();
          confirmAndAdd(digits);
          return;
        }
      }
    } catch (e) { /* kare atlanabilir, döngü devam */ }
    scanLoopId = requestAnimationFrame(loop);
  };
  scanLoopId = requestAnimationFrame(loop);
}

function stopScanner() {
  if (scanLoopId) { cancelAnimationFrame(scanLoopId); scanLoopId = null; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  if (els.sv) els.sv.srcObject = null;
}

function detectIOS() {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream && !window.navigator.standalone && els.ib) {
    els.ib.classList.remove("hidden");
  }
}

function initOffline() {
  window.addEventListener("online", () => toast("🌐 Çevrimiçi moda geçildi", "success"));
  window.addEventListener("offline", () => toast("🔌 Çevrimdışı çalışılıyor", "warn"));
}

function syncSettingsUI() {
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.checked = v; };
  set("#setSound", app.settings.sound);
  set("#setVibration", app.settings.vibration);
  set("#setNotif", app.settings.notifications && ("Notification" in window) && Notification.permission === "granted");
}

/* ─── Sabah Hatırlatıcısı ───────────────────────────────────────────
   SW'nin sayfa kapalıyken de okuyabilmesi için iade sayısı ve özet,
   Cache API üzerinden küçük bir meta dosyasına yazılır. */
const META_CACHE = "dragon-stock-meta";
const META_KEY = "./app-meta.json";

async function readMeta() {
  try {
    const c = await caches.open(META_CACHE);
    const r = await c.match(META_KEY);
    return r ? await r.json() : {};
  } catch (e) { return {}; }
}

async function updateMetaCache(extra) {
  try {
    if (!("caches" in window)) return;
    const due = app.parts.filter(p => p.state === "warranty" || p.state === "ypa");
    const names = due.slice(0, 3).map(p => `${p.code}${p.note ? " · " + p.note : ""}`).join(", ");
    const prev = await readMeta();
    const meta = Object.assign(prev, {
      dueCount: due.length,
      summary: due.length
        ? `${due.length} parça depoya iade bekliyor: ${names}${due.length > 3 ? "…" : ""}`
        : ""
    }, extra || {});
    const c = await caches.open(META_CACHE);
    await c.put(META_KEY, new Response(JSON.stringify(meta)));
  } catch (e) {}
}

/* Android, kurulu PWA'lara arka planda periyodik uyanma izni verir;
   SW saat 9'dan sonraki ilk tetiklemede hatırlatmayı gösterir. */
async function setupPeriodicReminder() {
  try {
    if (!app.settings.notifications) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !("periodicSync" in reg)) return;
    const status = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (status.state !== "granted") return;
    await reg.periodicSync.register("daily-return-reminder", { minInterval: 6 * 60 * 60 * 1000 });
  } catch (e) {}
}

/* Uygulama açılınca: saat 9'u geçtiyse ve iade bekleyen parça varsa hatırlat.
   Sistem bildirimi izin gerektirir; uygulama içi hatırlatma her zaman gösterilir. */
async function morningCheck() {
  try {
    if (new Date().getHours() < 9) return;
    const due = app.parts.filter(p => p.state === "warranty" || p.state === "ypa");
    if (!due.length) return;

    // Aynı gün içinde tekrar tekrar toast gösterme (visibilitychange ile de çağrılıyor)
    if (morningCheck._day === todayKey()) return;
    morningCheck._day = todayKey();

    // Uygulama içi hatırlatma — bildirim izninden bağımsız, her zaman görünür.
    const overdueNow = due.filter(p => Date.now() > (returnDeadline(p) || Infinity));
    toast(
      overdueNow.length
        ? `⚠️ ${overdueNow.length} iade GECİKTİ! Arızalı iadeleri depoya verdin mi?`
        : `🌅 Günaydın! ${due.length} parça depoya iade bekliyor.`,
      overdueNow.length ? "error" : "info",
      8000
    );

    // Sistem bildirimi yalnızca izin açıksa ve günde bir kez.
    if (!app.settings.notifications) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const meta = await readMeta();
    if (meta.lastReminderDate === todayKey()) return;
    await updateMetaCache({ lastReminderDate: todayKey() });
    const overdue = overdueNow;
    const body = due.slice(0, 5)
      .map(p => `${p.code}${p.note ? " · " + p.note : ""} (${stateLabels[p.state]})`)
      .join("\n");
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({
      type: "SHOW_NOTIFICATION",
      title: overdue.length
        ? `⚠️ ${overdue.length} iade GECİKTİ — Arızalı iadeleri verdin mi?`
        : "🌅 Günaydın! Arızalı iadeleri verdin mi?",
      body,
      tag: "morning-reminder"
    });
  } catch (e) {}
}

/* Depoya iadesi geciken/yaklaşan parçalar için bildirim */
async function checkReturnReminders() {
  try {
    if (!app.settings.notifications) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const due = app.parts.filter(p => p.state === "ypa" || p.state === "warranty");
    if (!due.length) return;
    const now = Date.now();
    const overdue = due.filter(p => now > (returnDeadline(p) || Infinity));
    const title = overdue.length
      ? `⚠️ ${overdue.length} parçanın iadesi GECİKTİ!`
      : `📦 ${due.length} parça depoya iade bekliyor`;
    const body = due.slice(0, 5)
      .map(p => `${p.code}${p.note ? " · " + p.note : ""} (${stateLabels[p.state]})`)
      .join("\n");
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.active) {
      reg.active.postMessage({ type: "SHOW_NOTIFICATION", title, body, tag: "return-reminder" });
    }
  } catch (e) { console.warn("Bildirim hatası:", e); }
}

const BK_KEY = "shadowStock.backupReminder";
function checkBackup() {
  const l = localStorage.getItem(BK_KEY);
  if (!l) { localStorage.setItem(BK_KEY, String(Date.now())); return; }
  // 7 günden eski yedek + kayıtlı parça varsa hatırlat
  const age = Date.now() - (+l || 0);
  if (age > 7 * DAY_MS && app.parts.length > 0) {
    toast("💾 Son yedeğin 1 haftadan eski — \"Veri Yedekle (JSON)\" ile yedek al.", "warn", 8000);
  }
}
function markBackupDone() { localStorage.setItem(BK_KEY, String(Date.now())); }

function particleCanvas() {
  const c = document.getElementById("particleCanvas"); if (!c) return;
  const ctx = c.getContext("2d"); let W, H, particles;
  const COLS = ["rgba(0,245,255,", "rgba(59,130,246,", "rgba(168,85,247,"];
  function resize() { W = c.width = innerWidth; H = c.height = innerHeight; }
  function create() { 
    particles = Array.from({ length: 40 }, () => ({ 
      x: Math.random() * (W || 400), y: Math.random() * (H || 800), 
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, 
      r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.4 + 0.1, 
      color: COLS[Math.floor(Math.random() * COLS.length)] 
    })); 
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = `${p.color}${p.a})`; ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  resize(); create(); frame();
  window.addEventListener("resize", () => { resize(); create(); });
}
