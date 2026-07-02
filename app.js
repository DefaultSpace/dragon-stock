/* ═══════════════════════════════════════════════════════════════════
   Shadow Stock — Dragon Evolution v3.5 (Master Edition)
   - Integrated Web Audio API Sound FX System (No external files needed)
   - Enhanced Barcode/QR Laser Scanning & State Management
   - Fixed all known edge cases, duplicate listeners, and optimized loops
   ═══════════════════════════════════════════════════════════════════ */

const STORAGE_KEY  = "shadowStockSystem.v3";
const DAY_MS       = 24 * 60 * 60 * 1000;
const THREE_DAYS   = 3 * DAY_MS;

const stateLabels = {
  active: "Aktif",
  warranty: "Garanti",
  ypa: "YPA",
  safeReturn: "İade",
  history: "Geçmiş"
};

const columns = [
  { key: "active",     title: "Aktif Stok", hint: "Araçtaki parçalar" },
  { key: "warranty",   title: "Garanti",     hint: "İade edilecekler" },
  { key: "ypa",        title: "YPA Acil",    hint: "24 saat içinde" },
  { key: "safeReturn", title: "Sağlam İade", hint: "Kullanılmayan" },
  { key: "history",    title: "Geçmiş",      hint: "Arşiv" }
];

const activeStates = ["active", "warranty", "ypa", "safeReturn"];

const DRAGON_STAGES = [
  { id: "egg",        name: "🥚 Ejderha Yumurtası",  minLevel: 0,  emoji: "🥚", desc: "İçinden bir ejderha çıkacak! Görev yaptıkça çatlayacak..." },
  { id: "hatchling",  name: "🐣 Minik Ejderha",       minLevel: 1,  emoji: "🐣", desc: "Yumurtadan çıktı! Küçük kanatları var." },
  { id: "young",      name: "🐉 Genç Ejderha",        minLevel: 4,  emoji: "🐉", desc: "Kanatları güçlendi, alev püskürtüyor!" },
  { id: "adult",      name: "🐲 Yetişkin Ejderha",     minLevel: 8,  emoji: "🐲", desc: "Gökyüzünde süzülüyor, alevleri cehennem sıcağı." },
  { id: "ancient",    name: "⚡ Efsanevi Ejderha",    minLevel: 16, emoji: "⚡", desc: "Zamanın başlangıcından beri var." }
];

// Pure Web Audio Synth Sound FX Generator
const sfx = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  play(type) {
    vibrate({ click: 8, success: [15, 30, 15], laser: [30, 50, 30], levelUp: [40, 60, 40, 60, 80] }[type] || 8);
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

document.addEventListener("DOMContentLoaded", () => {
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
    sdn: $("#dDialogName"), ss: $("#strengthStat"), sa: $("#agilityStat"), sp: $("#perceptionStat"),
    sg: $("#goldStat"), sf: $("#firePowerStat"), sl: $("#dialogLevel"), sde: $("#dDialogEmoji"),
    sdd: $("#dDialogDesc"), hl: $("#headerLevel"), sv: $("#scannerVideo"), stip: $("#scannerTip")
  });
}

function bindEvents() {
  if (els.pf) {
    els.pf.addEventListener("submit", e => { 
      e.preventDefault(); 
      addPart(els.pi.value, els.pn?.value?.trim() || ""); 
    });
  }
  
  if (els.pi) {
    els.pi.addEventListener("input", () => { 
      els.pi.value = els.pi.value.replace(/\D/g, "").slice(0, 8); 
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

  const simulateScan = document.querySelector("#simulateScan");
  if (simulateScan && els.scd && els.pi) {
    simulateScan.addEventListener("click", () => {
      sfx.play("laser");
      const c = String(Math.floor(10000000 + Math.random() * 90000000));
      els.scd.close();
      els.pi.value = c;
      addPart(c, "Barkod Tarayıcı İle Eklendi");
    });
  }

  document.querySelectorAll("[data-complete-quest]").forEach(b => {
    b.addEventListener("click", () => completeQuest(b.dataset.completeQuest));
  });

  const resetQuestsBtn = document.querySelector("#resetQuestsBtn");
  if (resetQuestsBtn) {
    resetQuestsBtn.addEventListener("click", () => { 
      app.quests = { date: todayKey(), completed: {} }; 
      saveMsg("Görevler yenilendi."); 
    });
  }

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

  const notifBtn = document.querySelector("#notifBtn");
  if (notifBtn && els.nd) notifBtn.addEventListener("click", () => els.nd.showModal());

  const exportBtn = document.querySelector("#exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => { sfx.play("success"); exportJson(); });

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

  const seedBtn = document.querySelector("#seedBtn");
  if (seedBtn) {
    seedBtn.addEventListener("click", () => { 
      app = initState(true); 
      activeFilter = "all"; 
      searchTerm = ""; 
      if (els.si) els.si.value = ""; 
      saveMsg("Mock veri yenilendi."); 
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
      if (!deferredInstallPrompt) return; 
      deferredInstallPrompt.prompt(); 
      await deferredInstallPrompt.userChoice; 
      deferredInstallPrompt = null; 
      els.ib.classList.add("hidden"); 
    });
  }
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./service-worker.js"); } catch(e) {}
  }
}

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
    return initState(); 
  }
}
app = loadState();

function initState(fresh) {
  const n = Date.now();
  return {
    profile: { name: "Hüseyin Emrehan", level: 1, exp: 30, stats: { strength: 2, agility: 2, perception: 1, firePower: 1 }, gold: 80 },
    quests: { date: todayKey(), completed: {} },
    penaltyActive: false, lastYpaClosureDate: null,
    weeklyCount: { lastDoneAt: null, weekKey: null },
    parts: [
      mkPart("12345678", "active", n - 2 * 3600000, "Çamaşır makinesi motoru"),
      mkPart("87654321", "warranty", n - 31 * 3600000, "Bulaşık makinesi kartı"),
      mkPart("11223344", "ypa", n - 3 * 3600000, "Buzdolabı NTC sensör"),
      mkPart("55667788", "safeReturn", n - 7 * 3600000, "Fırın rezistansı")
    ]
  };
}

function normalize(d) {
  const p = d.profile || {};
  const s = { 
    strength: +p.stats?.strength || 1, 
    agility: +p.stats?.agility || 1, 
    perception: +p.stats?.perception || 1, 
    firePower: +p.stats?.firePower || 1 
  };
  return {
    profile: { name: p.name || "Hüseyin Emrehan", level: +p.level || 1, exp: +p.exp || 0, stats: s, gold: +p.gold || 0 },
    quests: d.quests || { date: todayKey(), completed: {} },
    penaltyActive: !!d.penaltyActive, lastYpaClosureDate: d.lastYpaClosureDate || null,
    weeklyCount: d.weeklyCount || { lastDoneAt: null, weekKey: null },
    parts: Array.isArray(d.parts) ? d.parts.map(normalizePart).filter(Boolean) : []
  };
}

function normalizePart(p) {
  if (!p || !/^\d{8}$/.test("" + p.code)) return null;
  return { 
    id: p.id || id(), 
    code: "" + p.code, 
    note: p.note || "", 
    state: stateLabels[p.state] ? p.state : "active", 
    createdAt: +p.createdAt || Date.now(), 
    timestamps: p.timestamps || { acquiredAt: Date.now() }, 
    history: Array.isArray(p.history) ? p.history : [] 
  };
}

function mkPart(code, state, createdAt, note) {
  const p = { id: id(), code, note, state, createdAt, timestamps: { acquiredAt: createdAt }, history: [{ state, at: createdAt }] };
  if (state === "warranty") p.timestamps.mountedAt = createdAt + 3600000;
  if (state === "ypa") p.timestamps.ypaStartedAt = createdAt;
  if (state === "safeReturn") p.timestamps.returnDecisionAt = createdAt;
  return p;
}

function addPart(val, note) {
  const code = ("" + val).trim();
  if (!/^\d{8}$/.test(code)) { flash("BSH kodu 8 rakam olmalı.", true); return; }
  const dup = app.parts.find(p => p.code === code && p.state !== "history");
  if (dup) { 
    setFilter(dup.state); 
    searchTerm = code; 
    if (els.si) els.si.value = code; 
    flash(`${code} zaten ${stateLabels[dup.state]} listesinde.`, true); 
    return; 
  }
  sfx.play("success");
  app.parts.unshift(mkPart(code, "active", Date.now(), note));
  award(20, 0, "agility", 1, "Stok girişi");
  if (els.pi) { els.pi.value = ""; els.pi.focus(); }
  if (els.pn) els.pn.value = ""; 
  save(); flash(`${code} eklendi.`); render();
  
  const card = document.querySelector(`[data-card-id="${app.parts[0].id}"]`);
  if (card) { 
    card.classList.add("just-added"); 
    setTimeout(() => card.classList.remove("just-added"), 1200); 
  }
  floatXP("+20 EXP", els.pi);
}

function changeState(id, next) {
  sfx.play("click");
  const p = findP(id); if (!p) return;
  const card = document.querySelector(`[data-card-id="${id}"]`);
  if (card) card.classList.add("state-changing");
  const now = Date.now(); p.state = next; p.history.push({ state: next, at: now });
  if (next === "active") p.timestamps.acquiredAt ||= now;
  if (next === "warranty") p.timestamps.mountedAt = now;
  if (next === "history") p.timestamps.archivedAt = now;
  if (next === "ypa") p.timestamps.ypaStartedAt = now;
  if (next === "safeReturn") p.timestamps.returnDecisionAt = now;
  
  const r = { 
    warranty: { e: 45, s: "strength" }, 
    history: { e: 80, g: 60, s: "strength" }, 
    ypa: { e: 25, s: "agility" }, 
    safeReturn: { e: 35, g: 15 }, 
    active: { e: 10 } 
  }[next];
  
  if (r) award(r.e || 0, r.g || 0, r.s || null, 1, "Durum değişikliği");
  saveMsg(`${p.code} güncellendi.`);
  if (r?.e && card) floatXP(`+${r.e} EXP`, card);
}

function deliverToWH(id) {
  const p = findP(id); if (!p) return;
  const prev = p.state;
  if (prev === "ypa" && app.lastYpaClosureDate === todayKey()) { 
    flash("Bugün 1 YPA hakkı var.", true); 
    return; 
  }
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
  if (prev === "ypa") app.lastYpaClosureDate = todayKey();
  p.timestamps.warehouseDeliveredAt = now; 
  p.history.push({ state: "warehouseDelivered", at: now }); 
  p.state = "history";
  award(prev === "ypa" ? 180 : 120, 90, "strength", 1, "Depo teslimi");
  saveMsg(`${p.code} depoya teslim.`);
}

function award(exp, gold, stat, amt, reason) {
  const before = app.profile.level, beforeStage = getDragonStage(before).id;
  app.profile.exp += exp || 0; app.profile.gold += gold || 0;
  if (stat) app.profile.stats[stat] = (app.profile.stats[stat] || 0) + (amt || 0);
  
  while (app.profile.exp >= expNeed(app.profile.level)) {
    app.profile.exp -= expNeed(app.profile.level);
    app.profile.level++;
    app.profile.stats.strength++; 
    app.profile.stats.agility++; 
    app.profile.stats.perception++; 
    app.profile.stats.firePower++;
  }
  
  const afterStage = getDragonStage(app.profile.level).id;
  if (app.profile.level > before) showLevelUp();
  if (afterStage !== beforeStage) triggerEvo(beforeStage, afterStage);
  updateDragonVisual();
}

function expNeed(l) { return 100 + (l - 1) * 55; }

function updateDragonVisual() {
  if (!els.dn) return;
  const stage = getDragonStage(app.profile.level), need = expNeed(app.profile.level), pct = Math.min(100, Math.round((app.profile.exp / need) * 100));
  els.dn.textContent = stage.name;
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

function completeQuest(key) {
  if (app.quests.completed[key]) { flash("Bu görev tamamlandı."); return; }
  sfx.play("success");
  const r = { stockEntry: { e: 50, g: 20, s: "agility" }, ypaHunter: { e: 150, g: 80, s: "strength" } }[key];
  app.quests.completed[key] = true;
  if (r) award(r.e, r.g, r.s, 1, "Görev");
  saveMsg("Görev tamamlandı! 🎉");
}

function openAudit() {
  if (!els.asu || !els.acl || !els.ad) return;
  const parts = app.parts.filter(p => activeStates.includes(p.state));
  els.asu.textContent = `${parts.length} parça sayılacak.`;
  els.acl.innerHTML = parts.length ? parts.map(p => `<label class="audit-item"><span><strong>${p.code}</strong><small>${stateLabels[p.state]}${p.note ? " · " + p.note : ""}</small></span><input type="checkbox" /></label>`).join("") : '<div class="empty-state">Sayılacak parça yok.</div>';
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
  award(220, 120, "perception", 3, "Sayım"); 
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
  els.wcl.innerHTML = parts.length ? parts.map(p => `<label class="audit-item"><span><strong>${p.code}</strong><small>${stateLabels[p.state]}${p.note ? " · " + p.note : ""}</small></span><input type="checkbox" /></label>`).join("") : '<div class="empty-state">Sayım gerekmez.</div>';
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
  award(300, 150, "perception", 2, "Haftalık sayım"); 
  els.wd.close(); 
  updateWBadge(); 
  saveMsg("✅ Haftalık sayım tamam!");
}

function evalPenalties() {
  const now = Date.now(), was = app.penaltyActive;
  app.penaltyActive = app.penaltyActive || app.parts.some(p => 
    (p.state === "ypa" && p.timestamps.ypaStartedAt && now - p.timestamps.ypaStartedAt > DAY_MS) || 
    (p.state === "warranty" && p.timestamps.mountedAt && now - p.timestamps.mountedAt > THREE_DAYS)
  );
  if (app.penaltyActive !== was) save();
}

function resetDaily() {
  if (app.quests.date === todayKey()) return;
  app.quests = { date: todayKey(), completed: {} }; 
  app.lastYpaClosureDate = null; 
  save();
}

function openStats() {
  if (!els.sd) return;
  const stage = getDragonStage(app.profile.level);
  if (els.sde) els.sde.textContent = stage.emoji;
  if (els.sdn) els.sdn.textContent = stage.name;
  if (els.sdd) els.sdd.textContent = stage.desc;
  if (els.ss) els.ss.textContent = app.profile.stats.strength;
  if (els.sa) els.sa.textContent = app.profile.stats.agility;
  if (els.sp) els.sp.textContent = app.profile.stats.perception;
  if (els.sg) els.sg.textContent = app.profile.gold;
  if (els.sf) els.sf.textContent = app.profile.stats.firePower;
  if (els.sl) els.sl.textContent = app.profile.level;
  els.sd.showModal();
}

function render() { 
  updateDragonVisual(); 
  renderQuests(); 
  renderStock(); 
  updateWBadge(); 
}

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
  const visible = activeFilter === "all" ? columns : columns.filter(c => c.key === activeFilter);
  els.sc.innerHTML = visible.map(col => {
    const items = app.parts.filter(p => p.state === col.key).filter(matchSearch);
    return `<section class="stock-column"><div class="column-head"><div><h3>${col.title}</h3><small>${col.hint}</small></div><span class="column-count">${items.length}</span></div><div class="part-list">${items.length ? items.map(renderCard).join("") : `<div class="empty-state">${emptyTxt(col.key)}</div>`}</div></section>`;
  }).join("");
  
  els.sc.querySelectorAll("[data-state]").forEach(b => b.addEventListener("click", () => changeState(b.dataset.id, b.dataset.state)));
  els.sc.querySelectorAll("[data-deliver]").forEach(b => b.addEventListener("click", () => deliverToWH(b.dataset.deliver)));
  els.sc.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => copyCode(b.dataset.copy)));
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
  
  return `<article class="part-card ${p.state}" data-card-id="${p.id}"><div class="part-head"><div><span class="part-code">${p.code}</span><small>${fmtDate(p.createdAt)}</small></div><span class="state-pill">${stateLabels[p.state]}</span></div>${p.note ? `<div class="part-note">📝 ${esc(p.note)}</div>` : ""}<div class="meta-list">${meta.map(([l, v]) => `<span>${l}: <b>${fmtDate(v)}</b></span>`).join("")}</div>${p.state === "ypa" ? `<div class="countdown" data-cd="${p.id}">${fmtCD(p)}</div>` : ""}<div class="card-actions">${renderActs(p)}</div></article>`;
}

function renderActs(p) {
  const btns = [["active", "Aktif"], ["warranty", "Garanti"], ["history", "Kapat"], ["ypa", "YPA"], ["safeReturn", "İade"]].filter(([s]) => s !== p.state).map(([s, l]) => `<button data-id="${p.id}" data-state="${s}">${l}</button>`);
  const util = [`<button data-copy="${p.code}">📋 Kod</button>`];
  const dlv = ["warranty", "ypa", "safeReturn"].includes(p.state) ? [`<button data-deliver="${p.id}">🚛 Teslim</button>`] : [];
  return [...util, ...btns, ...dlv].join("");
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
  return app.parts.reduce((c, p) => { c[p.state] = (c[p.state] || 0) + 1; return c; }, { active: 0, warranty: 0, ypa: 0, safeReturn: 0, history: 0 }); 
}
function emptyTxt(k) { 
  if (searchTerm) return "Eşleşen yok."; 
  return "Liste boş."; 
}

function tickCD() {
  document.querySelectorAll("[data-cd]").forEach(n => {
    const p = findP(n.dataset.cd); if (!p) return;
    n.textContent = fmtCD(p);
    const r = p.timestamps.ypaStartedAt + DAY_MS - Date.now();
    n.classList.toggle("hot", r > 0 && r < 3600000);
  });
}
function fmtCD(p) { 
  const r = Math.max(0, p.timestamps.ypaStartedAt + DAY_MS - Date.now()); 
  return `⏱ ${pad(Math.floor(r / 3600000))}:${pad(Math.floor((r % 3600000) / 60000))}:${pad(Math.floor((r % 60000) / 1000))}`; 
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(app)); }
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
}

async function importJson(e) {
  const [f] = e.target.files; if (!f) return;
  try { 
    const t = await f.text(), d = JSON.parse(t); 
    app = normalize(d.appState || d); 
    render(); 
    saveMsg("Veriler başarıyla aktarıldı."); 
  } catch(err) { flash("Dosya okunamadı.", true); }
}

function vibrate(pattern) {
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
          if (els.pi) els.pi.value = digits;
          addPart(digits, "Barkod ile okutuldu");
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

const BK_KEY = "shadowStock.backupReminder";
function checkBackup() {
  const l = localStorage.getItem(BK_KEY);
  if (!l) { localStorage.setItem(BK_KEY, String(Date.now())); return; }
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
