(function(){
  "use strict";

  // ====== Select kustom util ======
  function createSelect(rootEl, opts){
    var state = { open:false, value:"", options:[], hoverIndex:-1, resetOnOpen:false };
    var placeholder = (opts && opts.placeholder) || "--Pilih--";
    var onChange = (opts && opts.onChange) || function(){};

    rootEl.classList.add("gselect");
    rootEl.innerHTML =
      '<button type="button" class="gbtn" aria-haspopup="listbox" aria-expanded="false">'+
        '<span class="glabel">'+placeholder+'</span>'+
        '<span class="gchev">▾</span>'+
      '</button>'+
      '<div class="glist" role="listbox" tabindex="-1"></div>';

    var btn = rootEl.querySelector(".gbtn");
    var glabel = rootEl.querySelector(".glabel");
    var list = rootEl.querySelector(".glist");

    function renderOptions(){
      list.innerHTML = "";
      state.options.forEach(function(opt, i){
        var div = document.createElement("div");
        div.className = "gitem";
        div.setAttribute("role", "option");
        div.setAttribute("data-value", opt.value);
        div.textContent = opt.label;
        if (opt.value === state.value) div.setAttribute("aria-selected","true");
        if (i === state.hoverIndex) div.setAttribute("aria-current","true");
        div.addEventListener("click", function(){
          setValue(opt.value, true);
          close();
        });
        list.appendChild(div);
      });
    }

    // update highlight/selected tanpa render ulang
    function updateHighlight(){
      var children = list.children;
      for (var i = 0; i < children.length; i++){
        if (i === state.hoverIndex) children[i].setAttribute("aria-current","true");
        else children[i].removeAttribute("aria-current");
        var opt = state.options[i];
        if (opt && opt.value === state.value) children[i].setAttribute("aria-selected","true");
        else children[i].removeAttribute("aria-selected");
      }
    }

    function open(){
      state.open = true;
      rootEl.classList.add("open");
      btn.setAttribute("aria-expanded","true");

      var foundIdx = state.options.findIndex(function(o){ return o.value === state.value; });
      state.hoverIndex = state.resetOnOpen ? 0 : Math.max(0, foundIdx);

      if (state.resetOnOpen){
        renderOptions();
        list.scrollTop = 0;
        state.resetOnOpen = false;
      } else {
        updateHighlight();
      }

      list.focus({ preventScroll:true });
      document.addEventListener("click", onDocClick, { capture:true, once:true });
    }
    function close(){
      state.open = false;
      rootEl.classList.remove("open");
      btn.setAttribute("aria-expanded","false");
    }
    function toggle(){ state.open ? close() : open(); }

    function setOptions(options, meta){
      state.options = options.slice();
      if (!state.options.some(function(o){ return o.value === state.value; })){
        state.value = "";
        glabel.textContent = placeholder;
      }
      renderOptions();
      if (meta && meta.resetOnOpen) state.resetOnOpen = true;
    }

    function setValue(val, emit){
      state.value = val;
      var found = state.options.find(function(o){ return o.value === val; });
      glabel.textContent = found ? found.label : placeholder;
      updateHighlight();
      if (emit) onChange(val);
    }

    function getValue(){ return state.value; }

    function onDocClick(e){
      if (!rootEl.contains(e.target)) close();
    }

    rootEl.addEventListener("keydown", function(e){
      if (!state.open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")){
        e.preventDefault(); open(); return;
      }
      if (state.open){
        if (e.key === "Escape"){ e.preventDefault(); close(); return; }
        if (e.key === "ArrowDown"){ e.preventDefault(); state.hoverIndex = Math.min(state.hoverIndex+1, state.options.length-1); renderOptions(); return; }
        if (e.key === "ArrowUp"){ e.preventDefault(); state.hoverIndex = Math.max(state.hoverIndex-1, 0); renderOptions(); return; }
        if (e.key === "Enter"){
          e.preventDefault();
          var opt = state.options[state.hoverIndex];
          if (opt){ setValue(opt.value, true); }
          close(); return;
        }
      }
    });

    btn.addEventListener("click", toggle);

    return { setOptions:setOptions, setValue:setValue, getValue:getValue, open:open, close:close };
  }

  // ====== App logic ======
  var API_URL = "https://script.google.com/macros/s/AKfycbzUkNj1mQAoKp2sKVR8I4UXXAvUqQNJu3F2zDvni9AJUJq9IK_Z5aRDu2DBG7BqPNmmPQ/exec";

  var ADMIN_NOTIFY_URL = "https://script.google.com/macros/s/AKfycbwhtHf5cI3MN2uQxHLZepXoVhZS9ziaQxHOrNN6AJPv5fUt0h911H_vGkg_GGURqtKIcw/exec";

  function notifyAdmin(payload){
    try{
      // Kirim sebagai text/plain agar simple request (tanpa preflight)
      fetch(ADMIN_NOTIFY_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      }).catch(function(err){
        console.warn("notifyAdmin network issue:", err);
      });
    } catch(e){
      console.error("notifyAdmin failed:", e);
    }
  }

  // ====== Frontend Cache (TTL 8 jam) ======
  var CATALOG_CACHE_KEY = "catalog_v1";
  var CATALOG_TTL_MS    = 480 * 60 * 1000;
  var MAX_CACHE_BYTES   = 200 * 1024;

  function hashString(str){
    var h = 5381;
    for (var i=0; i<str.length; i++){ h = ((h<<5)+h) ^ str.charCodeAt(i); }
    return (h>>>0).toString(36);
  }
  function computeHash(arr){
    try { return hashString(JSON.stringify(arr)); } catch(_) { return ""; }
  }

  // ====== DEDUPE: signature & storage ======
  var LAST_SENT_SIGS_KEY = "sent_order_sigs";
  function getOrderSig(cartArr, total){
    var norm = cartArr.map(function(it){
      return [String(it.operator||""), String(it.nama||""), Number(it.harga||0), Number(it.qty||0)];
    }).sort(function(a,b){
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
      if (a[2] !== b[2]) return a[2] - b[2];
      return a[3] - b[3];
    });
    try { return hashString(JSON.stringify({ items:norm, total:Number(total||0) })); }
    catch(_) { return String(total)+":"+norm.map(function(r){return r.join("|");}).join(";"); }
  }

  function saveCatalogToCache(arr){
    try {
      var payload = { ts: Date.now(), data: arr, hash: computeHash(arr) };
      var json = JSON.stringify(payload);
      if (json.length > MAX_CACHE_BYTES) return;
      localStorage.setItem(CATALOG_CACHE_KEY, json);
    } catch(_) { /* quota penuh → abaikan */ }
  }
  function loadCatalogFromCache(){
    try {
      var raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.data) return null;
      return obj;
    } catch(_) { return null; }
  }
  function isFresh(ts){ return (Date.now() - (ts||0)) <= CATALOG_TTL_MS; }

  var data = [];
  var cart = [];

  // ===== Ranking untuk pengurutan keranjang (baru) =====
  var opSel, vSel, opRank = new Map(), voucherRank = new Map();

  // ===== Footer "Last Fetching" =====
  var lastFetchEl = null;
  function fmtDate(ts){
    var d = new Date(ts);
    var dd = String(d.getDate()).padStart(2,'0');
    var mm = String(d.getMonth()+1).padStart(2,'0');
    var yy = d.getFullYear();
    var hh = String(d.getHours()).padStart(2,'0');
    var mi = String(d.getMinutes()).padStart(2,'0');
    return dd + "/" + mm + "/" + yy + ", " + hh + ":" + mi;
  }
  function updateLastFetch(ts){
    if (!lastFetchEl) return;
    lastFetchEl.textContent = "Last Fetching: " + (ts ? fmtDate(ts) : "-");
  }

  function rankKey(op, nm){ return String(op) + "\x1F" + String(nm); }
  function rebuildVoucherRank(arr){
    voucherRank = new Map();
    var seenPerOp = new Map();
    arr.forEach(function(x){
      var c = seenPerOp.get(x.operator) || 0;
      var k = rankKey(x.operator, x.nama);
      if (!voucherRank.has(k)){
        voucherRank.set(k, c);
        seenPerOp.set(x.operator, c+1);
      }
    });
  }
  function rankOperator(op){
    var idx = opRank.get(op);
    return (idx == null) ? 9999 : idx;
  }
  function rankVoucher(op, nm){
    var idx = voucherRank.get(rankKey(op, nm));
    return (idx == null) ? 9999 : idx;
  }
  function sortCart(){
    cart.sort(function(a,b){
      var byOp = rankOperator(a.operator) - rankOperator(b.operator);
      if (byOp !== 0) return byOp;
      var byVoucher = rankVoucher(a.operator, a.nama) - rankVoucher(b.operator, b.nama);
      if (byVoucher !== 0) return byVoucher;
      return 0;
    });
  }

  function rupiah(n){ return isNaN(n) ? "0" : Number(n).toLocaleString("id-ID"); }
  function setText(id, txt){ var el = document.getElementById(id); if (el) el.textContent = txt; }

  // ====== UNDO untuk Hapus ======
  var UNDO_MS = 5000;
  var undoTimer = null;
  var lastRemoved = null;

  function hideUndoToast(){
    var t = document.getElementById("undoToast");
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }
  function showUndoToast(item){
    if (undoTimer){ clearTimeout(undoTimer); undoTimer = null; }
    hideUndoToast();
    lastRemoved = { operator: item.operator, nama: item.nama, harga: item.harga, qty: item.qty };

    var toast = document.createElement("div");
    toast.id = "undoToast";
    toast.setAttribute("role","status");
    toast.setAttribute("aria-live","polite");
    Object.assign(toast.style, {
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: "16px",
      background: "var(--card)",
      border: "1px solid var(--border)",
      color: "var(--text)",
      padding: "8px 10px",
      borderRadius: "999px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      boxShadow: "var(--shadow)",
      zIndex: "1001",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)"
    });

    var msg = document.createElement("span");
    msg.textContent = "Item dihapus";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Undo";
    Object.assign(btn.style, {
      border: "1px solid var(--border)",
      background: "linear-gradient(180deg, rgba(124,215,255,0.20), rgba(90,176,255,0.12))",
      color: "var(--text)",
      padding: "6px 10px",
      borderRadius: "999px",
      fontWeight: "600",
      cursor: "pointer",
      fontSize: "14px"
    });
    btn.addEventListener("click", function(){
      if (!lastRemoved) return;
      var it = lastRemoved; lastRemoved = null;
      hideUndoToast();
      if (undoTimer){ clearTimeout(undoTimer); undoTimer = null; }
      var exist = cart.find(function(x){ return x.operator === it.operator && x.nama === it.nama; });
      if (exist) exist.qty += it.qty;
      else cart.push(it);
      sortCart();
      renderCart();
    });

    toast.appendChild(msg);
    toast.appendChild(btn);
    document.body.appendChild(toast);

    undoTimer = setTimeout(function(){
      hideUndoToast();
      lastRemoved = null;
      undoTimer = null;
    }, UNDO_MS);
  }

  // ====== HOLD (long-press) untuk qty +/− ======
  var holdState = {
    active:false, key:null, delta:0,
    delayTimer:null, repeatTimer:null, accel1:null, accel2:null,
    ignoreClick:false
  };

  function rowKeyFromButton(btn){
    var tr = btn.closest("tr");
    if (!tr) return null;
    var tds = tr.getElementsByTagName("td");
    if (tds.length < 2) return null;
    return { op: tds[0].textContent.trim(), nm: tds[1].textContent.trim() };
  }
  function stepQtyByKey(key, delta){
    var i = cart.findIndex(function(x){ return x.operator === key.op && x.nama === key.nm; });
    if (i === -1) return false;
    var before = cart[i].qty || 1;
    var next = before + delta;
    if (next < 1) next = 1;
    if (next === before) return false;
    cart[i].qty = next;
    renderCart();
    return true;
  }
  function startHold(key, delta){
    holdState.active = true;
    holdState.key = key;
    holdState.delta = delta;
    holdState.ignoreClick = true;

    stepQtyByKey(key, delta);

    holdState.delayTimer = setTimeout(function(){
      holdState.repeatTimer = setInterval(function(){
        var changed = stepQtyByKey(holdState.key, holdState.delta);
        if (!changed && holdState.delta < 0) stopHold();
      }, 120);

      holdState.accel1 = setTimeout(function(){
        if (holdState.repeatTimer){ clearInterval(holdState.repeatTimer); }
        holdState.repeatTimer = setInterval(function(){ stepQtyByKey(holdState.key, holdState.delta); }, 60);
      }, 900);

      holdState.accel2 = setTimeout(function(){
        if (holdState.repeatTimer){ clearInterval(holdState.repeatTimer); }
        holdState.repeatTimer = setInterval(function(){ stepQtyByKey(holdState.key, holdState.delta); }, 30);
      }, 1800);
    }, 350);
  }
  function stopHold(){
    if (!holdState.active) return;
    holdState.active = false;
    if (holdState.delayTimer){ clearTimeout(holdState.delayTimer); holdState.delayTimer = null; }
    if (holdState.repeatTimer){ clearInterval(holdState.repeatTimer); holdState.repeatTimer = null; }
    if (holdState.accel1){ clearTimeout(holdState.accel1); holdState.accel1 = null; }
    if (holdState.accel2){ clearTimeout(holdState.accel2); holdState.accel2 = null; }
    holdState.key = null;
    holdState.delta = 0;
  }

  // === load(force): jika force=true → bypass cache utk render awal + simpan cache baru ===
  async function load(force) {
    var err = document.getElementById("err");
    err.style.display = "none";

    setText("dbg_url", API_URL);
    setText("dbg_status", force ? "Reload paksa…" : "-");
    setText("dbg_ct", "-");
    setText("dbg_count", "0");
    setText("dbg_ops", "-");
    setText("dbg_sample", "");
    setText("dbg_raw", "");

    // 1) Cache-first kecuali force
    var cached = !force ? loadCatalogFromCache() : null;
    if (cached && Array.isArray(cached.data) && cached.data.length){
      data = cached.data;
      rebuildVoucherRank(data);
      setText("dbg_count", String(data.length));
      var opsCached = Array.from(new Set(data.map(function(d){ return d.operator; }))).sort();
      setText("dbg_ops", opsCached.join(", ") || "-");
      setText("dbg_sample", JSON.stringify(data.slice(0,3), null, 2));
      buildOperator(opsCached);
      buildVoucher();
      if (cart.length){ sortCart(); renderCart(); }
      updateAddButtonState();
      updateLastFetch(cached.ts);
    }

    // 2) Selalu fetch jaringan (revalidate / force)
    try {
      var url = API_URL + (API_URL.indexOf("?") >= 0 ? "&" : "?") + (force ? "_force=" : "_=") + Date.now();
      var res = await fetch(url, { cache: force ? "reload" : "no-store" });
      setText("dbg_status", "HTTP " + res.status + (force ? " (force)" : ""));
      setText("dbg_ct", res.headers.get("content-type") || "(tidak ada)");

      var raw = await res.text();
      setText("dbg_raw", raw.slice(0, 600));

      if (!res.ok) throw new Error("HTTP " + res.status);

      var json = JSON.parse(raw);
      var arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
      var freshData = arr.map(function(x){
        return {
          operator: String((x && (x.operator != null ? x.operator : x.Operator)) || "").trim(),
          nama: String((x && (x.nama != null ? x.nama : x["Nama Voucher"])) || "").trim(),
          harga: Number((x && (x.harga != null ? x.harga : x.Harga)) || 0)
        };
      }).filter(function(x){ return x.operator && x.nama; });

      setText("dbg_count", String(freshData.length));
      var ops = Array.from(new Set(freshData.map(function(d){ return d.operator; }))).sort();
      setText("dbg_ops", ops.join(", ") || "-");
      setText("dbg_sample", JSON.stringify(freshData.slice(0,3), null, 2));

      saveCatalogToCache(freshData);
      rebuildVoucherRank(freshData);

      var hadCache = !!(cached && Array.isArray(cached.data) && cached.data.length);
      var cacheWasFresh = !!(cached && isFresh(cached.ts));
      data = freshData;

      if (force) {
        buildOperator(ops);
        buildVoucher();
        updateAddButtonState();
      } else if (!hadCache || !cacheWasFresh){
        buildOperator(ops);
        buildVoucher();
        updateAddButtonState();
      }
      if (cart.length){ sortCart(); renderCart(); }
      updateLastFetch(Date.now());

    } catch(e) {
      if (!(cached && cached.data && cached.data.length)){
        updateLastFetch(null);
        err.textContent = "Gagal memuat data. Klik tombol Debug untuk lihat detail.";
        err.style.display = "block";
      }
      console.error(e);
    }
  }

  function buildOperator(ops) {
    var options = [{ value:"", label:"--Pilih--"}]
      .concat(ops.map(function(o){ return { value:o, label:o }; }));
    opRank = new Map(ops.map(function(o,i){ return [o, i]; }));
    opSel.setOptions(options);
    opSel.setValue("", false);
    updateAddButtonState();
  }

  function buildVoucher() {
    var op = opSel.getValue();
    var items = data.filter(function(d){ return d.operator === op; });
    var options = [{ value:"", label:"--Pilih--"}]
      .concat(items.map(function(d){ return { value:d.nama, label:(d.nama+" - "+rupiah(d.harga)) }; }));
    vSel.setOptions(options, { resetOnOpen: true });
    vSel.setValue("", false);
    document.getElementById("qty").value = "";
    updateAddButtonState();
  }

  function addToCart() {
    var op = opSel.getValue();
    var nm = vSel.getValue();
    var qtyInput = document.getElementById("qty").value;
    var qty = parseInt(qtyInput, 10);
    if (!qtyInput || isNaN(qty) || qty <= 0) qty = 1;
    if (!op || !nm) { alert("Pilih operator dan voucher yang valid."); return; }
    var v = data.find(function(x){ return x.operator === op && x.nama === nm; });
    if (!v) return;

    var exist = cart.find(function(i){ return i.operator === op && i.nama === nm; });
    if (exist) exist.qty += qty;
    else cart.push({ operator: op, nama: nm, harga: v.harga, qty: qty });

    sortCart();
    renderCart();
    document.getElementById("qty").value = "";
    updateAddButtonState();
  }

  function calcTotals() {
    var sub = cart.reduce(function(a,b){ return a + (b.harga * b.qty); }, 0);
    var grand = sub;
    setText("grand", rupiah(grand));
    return { grand: grand };
  }

  // ===== renderCart aman (tanpa innerHTML) + click only =====
  var holdEventsBound = false;
  function renderCart() {
    var tbody = document.querySelector("#cart tbody");
    tbody.innerHTML = "";

    cart.forEach(function(it, idx){
      var tr = document.createElement("tr");

      var tdOp = document.createElement("td");
      tdOp.textContent = it.operator;
      tr.appendChild(tdOp);

      var tdNama = document.createElement("td");
      tdNama.textContent = it.nama;
      tr.appendChild(tdNama);

      var tdHarga = document.createElement("td");
      tdHarga.className = "right";
      tdHarga.textContent = rupiah(it.harga);
      tr.appendChild(tdHarga);

      var tdQty = document.createElement("td");
      tdQty.className = "right";
      var wrap = document.createElement("div");
      wrap.className = "qty-control";

      var btnMin = document.createElement("button");
      btnMin.type = "button";
      btnMin.className = "qty-btn qty-minus";
      btnMin.dataset.idx = String(idx);
      btnMin.textContent = "-";

      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "1";
      inp.value = String(it.qty);
      inp.className = "qty-input";
      inp.dataset.idx = String(idx);

      var btnPlus = document.createElement("button");
      btnPlus.type = "button";
      btnPlus.className = "qty-btn qty-plus";
      btnPlus.dataset.idx = String(idx);
      btnPlus.textContent = "+";

      wrap.appendChild(btnMin);
      wrap.appendChild(inp);
      wrap.appendChild(btnPlus);
      tdQty.appendChild(wrap);
      tr.appendChild(tdQty);

      var tdSub = document.createElement("td");
      tdSub.className = "right";
      tdSub.textContent = rupiah(it.harga * it.qty);
      tr.appendChild(tdSub);

      var tdDel = document.createElement("td");
      var btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-ghost";
      btnDel.dataset.idx = String(idx);
      btnDel.textContent = "Hapus";
      tdDel.appendChild(btnDel);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    });

    // ——— CLICK ———
    tbody.onclick = function(e){
      var t = e.target;
      if (!(t instanceof Element)) return;

      if ((t.classList.contains("qty-minus") || t.classList.contains("qty-plus")) && holdState.ignoreClick){
        holdState.ignoreClick = false;
        return;
      }

      var iStr = t.getAttribute("data-idx");
      if (!iStr) return;
      var i = parseInt(iStr, 10);
      if (isNaN(i) || i < 0 || i >= cart.length) return;

      if (t.classList.contains("qty-minus")) {
        cart[i].qty = Math.max(1, (cart[i].qty || 1) - 1);
        renderCart();
      } else if (t.classList.contains("qty-plus")) {
        cart[i].qty = (cart[i].qty || 0) + 1;
        renderCart();
      } else if (t.classList.contains("btn-ghost")) {
        var removed = { operator: cart[i].operator, nama: cart[i].nama, harga: cart[i].harga, qty: cart[i].qty };
        cart.splice(i, 1);
        renderCart();
        showUndoToast(removed);
      }
    };

    // ——— HOLD (pointer) ———
    if (!holdEventsBound){
      const onPointerDown = function(e){
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.classList.contains("qty-minus") || t.classList.contains("qty-plus")){
          e.preventDefault();
          const key = rowKeyFromButton(t);
          if (!key) return;
          const delta = t.classList.contains("qty-plus") ? 1 : -1;
          startHold(key, delta);
        }
      };
      tbody.addEventListener("pointerdown", onPointerDown, { passive: false });

      const stopAll = function(){ stopHold(); };
      document.addEventListener("pointerup", stopAll, { passive: true });
      document.addEventListener("pointercancel", stopAll, { passive: true });

      tbody.addEventListener("contextmenu", function(e){
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.classList.contains("qty-minus") || t.classList.contains("qty-plus")){
          e.preventDefault();
        }
      }, { passive: false });

      document.addEventListener("visibilitychange", function(){
        if (document.hidden) stopHold();
      });

      holdEventsBound = true;
    }

    // ——— input qty manual ———
    tbody.onchange = function(e){
      var t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!t.classList.contains("qty-input")) return;
      var i = parseInt(t.getAttribute("data-idx") || "-1", 10);
      var val = parseInt(t.value, 10);
      if (isNaN(val) || val <= 0) val = 1;
      cart[i].qty = val;
      renderCart();
    };

    calcTotals();
  }

  // ====== Dialog konfirmasi (kontras tinggi, solid, nyaman dibaca) ======
  function confirmDialog(opts){
    return new Promise(function(resolve){
      var title = (opts && opts.title) || "Konfirmasi";
      var message = (opts && opts.message) || "Lanjutkan tindakan ini?";
      var okText = (opts && opts.okText) || "Ya";
      var cancelText = (opts && opts.cancelText) || "Batal";

      // Deteksi tema saat ini
      var isLight = document.documentElement.getAttribute("data-theme") === "light";

      // Warna/kontras yang enak di mata (solid, tidak tembus overlay)
      var BG     = isLight ? "#ffffff" : "#0f1720";
      var TEXT   = isLight ? "#0b0f14" : "#eaf2ff";
      var SUB    = isLight ? "#4b5b6d" : "#cbd8ea";
      var BORDER = isLight ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.18)";
      var SHADOW = isLight
        ? "0 18px 55px rgba(0,0,0,.18), 0 6px 16px rgba(0,0,0,.08)"
        : "0 22px 60px rgba(0,0,0,.55)";

      var overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position:"fixed", inset:"0",
        background:"rgba(0,0,0,0.50)", // cukup gelap, tapi tidak berlebihan
        display:"flex", alignItems:"center", justifyContent:"center",
        zIndex:"2000", padding:"16px"
      });

      var box = document.createElement("div");
      Object.assign(box.style, {
        minWidth:"min(460px,100%)", maxWidth:"560px",
        background: BG,            // SOLID → modal tidak meredup
        color: TEXT,
        border:"1px solid " + BORDER,
        borderRadius:"12px",
        boxShadow: SHADOW,
        // JANGAN pakai backdrop-filter di modal supaya tetap tajam
        padding:"18px 16px 14px"
      });
      box.setAttribute("role","dialog");
      box.setAttribute("aria-modal","true");
      box.setAttribute("aria-labelledby","confTitle");

      var h = document.createElement("h3");
      h.id = "confTitle";
      h.textContent = title;
      Object.assign(h.style, { margin:"0 0 8px", fontSize:"17px", fontWeight:"700", letterSpacing:"0.2px" });

      var p = document.createElement("p");
      p.textContent = message;
      Object.assign(p.style, {
        margin:"0 0 14px",
        color: SUB,            // lebih soft tapi tetap terbaca
        fontSize:"14.5px",
        lineHeight:"1.55"
      });

      var row = document.createElement("div");
      Object.assign(row.style, { display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"6px" });

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-ghost";
      cancelBtn.textContent = cancelText;
      Object.assign(cancelBtn.style, {
        borderColor: BORDER,
        padding:"10px 14px",
        fontWeight:"600"
      });

      var okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn";
      okBtn.textContent = okText;
      Object.assign(okBtn.style, {
        padding:"10px 16px",
        fontWeight:"700",
        // sedikit tonjolkan primary tanpa terlalu terang
        borderColor: "rgba(124,215,255,0.6)"
      });

      // Nonaktifkan scroll body saat modal terbuka
      var prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      function close(val){
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prevOverflow;
        resolve(val);
      }
      function onKey(e){
        if (e.key === "Escape"){ e.preventDefault(); close(false); }
        if (e.key === "Enter"){ e.preventDefault(); close(true); }
      }

      cancelBtn.addEventListener("click", function(){ close(false); });
      okBtn.addEventListener("click", function(){ close(true); });
      overlay.addEventListener("click", function(e){ if (e.target === overlay) close(false); });
      document.addEventListener("keydown", onKey);

      row.appendChild(cancelBtn);
      row.appendChild(okBtn);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      try { okBtn.focus(); } catch(_){}
    });
  }




  // ===== printReceipt + DEDUPE =====
  function printReceipt() {
    var totals = calcTotals();
    if (cart.length === 0) { alert("Keranjang kosong, tidak ada yang bisa dibagikan."); return; }

    // ID deterministik dari isi keranjang
    var orderSig = getOrderSig(cart, totals.grand);
    var orderId  = orderSig.slice(0, 8).toUpperCase();
    var receiptText = "";

    try {
      var lines = [];
      lines.push("STRUK PEMBELIAN VOUCHER");
      lines.push("No: " + orderId);
      lines.push("--------------------------------");
      var maxLength = 32;

      cart.forEach(function(it) {
        var subtotal = rupiah(it.harga * it.qty);
        var leftPart = it.qty + " x " + rupiah(it.harga);
        var rightPart = subtotal;

        var totalLength = leftPart.length + rightPart.length;
        var paddingLength = maxLength - totalLength;

        if (paddingLength < 0) {
          var excess = totalLength - maxLength;
          if (leftPart.length > rightPart.length) {
            leftPart = leftPart.substring(0, Math.max(0, leftPart.length - excess - 1));
          } else {
            rightPart = rightPart.substring(0, Math.max(0, rightPart.length - excess - 1));
          }
          totalLength = leftPart.length + rightPart.length;
          paddingLength = Math.max(0, maxLength - totalLength);
        }

        var padding = " ".repeat(paddingLength);

        lines.push("[" + it.operator + "] " + it.nama);
        lines.push(leftPart + padding + rightPart);
      });

      lines.push("--------------------------------");
      var totalLabel = "TOTAL =";
      var totalValue = rupiah(totals.grand);
      var totalPadding = " ".repeat(Math.max(0, maxLength - totalLabel.length - totalValue.length));
      lines.push(totalLabel + totalPadding + totalValue);
      lines.push(" ");
      lines.push(new Date().toLocaleString("id-ID"));
      lines.push("Terima kasih.");

      receiptText = lines.join("\n");

      if (navigator.share) {
        navigator.share({ title: "Struk Pembelian", text: receiptText })
          .catch(function(e) {
            console.error("Gagal membagikan struk:", e);
            showReceiptOverlay(receiptText);
          });
      } else {
        showReceiptOverlay(receiptText);
        alert("Fitur berbagi tidak didukung di browser ini. Struk ditampilkan di layar.");
      }
    } catch(e) {
      console.error("Error saat membagikan struk:", e);
      alert("Gagal membagikan struk. Cek konsol untuk detail atau coba lagi.");
    }

    // === KIRIM NOTIF KE ADMIN (dedupe berbasis signature) ===
    try {
      var sent = [];
      try { sent = JSON.parse(sessionStorage.getItem(LAST_SENT_SIGS_KEY) || "[]"); } catch(_){}
      if (sent.indexOf(orderSig) >= 0) {
        console.info("Skip notify: No. Struk sudah pernah dikirim:", orderId);
      } else {
        var payload = {
          orderId: orderId,
          orderSig: orderSig,
          ts: Date.now(),
          items: cart.map(function(it){
            return {
              operator: it.operator,
              nama: it.nama,
              harga: it.harga,
              qty: it.qty,
              subtotal: it.harga * it.qty
            };
          }),
          total: totals.grand,
          client: {
            ua: (navigator && navigator.userAgent) || "",
            lang: (navigator && navigator.language) || ""
          },
          receiptText: receiptText
        };

        notifyAdmin(payload);

        sent.push(orderSig);
        if (sent.length > 50) sent = sent.slice(-50);
        sessionStorage.setItem(LAST_SENT_SIGS_KEY, JSON.stringify(sent));
      }
    } catch(e){
      console.warn("gagal memproses dedupe/notify:", e);
    }

    function showReceiptOverlay(text) {
      var overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.8)",
        color: "#fff",
        padding: "20px",
        zIndex: "1000",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      });

      var pre = document.createElement("pre");
      pre.style.margin = "0";
      pre.style.whiteSpace = "pre-wrap";
      pre.textContent = text;

      var controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "8px";

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "Tutup";
      closeBtn.addEventListener("click", function(){ overlay.remove(); });

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "Salin";
      copyBtn.addEventListener("click", function(){
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function(){
            copyBtn.textContent = "Disalin!";
            setTimeout(function(){ copyBtn.textContent = "Salin"; }, 1500);
          }).catch(function(){ /* abaikan */ });
        }
      });

      controls.appendChild(closeBtn);
      controls.appendChild(copyBtn);
      overlay.appendChild(pre);
      overlay.appendChild(controls);
      document.body.appendChild(overlay);
    }
  }

  // ===== helper: validasi halus tombol Tambah =====
  function updateAddButtonState(){
    var btn = document.getElementById("btnAdd");
    if (!btn) return;
    var hasOp = !!(opSel && opSel.getValue());
    var hasVoucher = !!(vSel && vSel.getValue());
    var enabled = hasOp && hasVoucher;
    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", (!enabled).toString());
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", function(){
    // Footer elemen (opsional, kalau ada)
    lastFetchEl = document.getElementById("lastFetch");
    updateLastFetch(null);

    // Operator
    opSel = createSelect(document.getElementById("opSelect"), {
      placeholder: "--Pilih--",
      onChange: function(){
        buildVoucher();
        updateAddButtonState();
      }
    });
    // Voucher
    vSel = createSelect(document.getElementById("voucherSelect"), {
      placeholder: "--Pilih--",
      onChange: function(){
        var q = document.getElementById("qty");
        q.value = "";
        try { q.focus({ preventScroll:true }); } catch(_) { q.focus(); }
        if (q.select) q.select();
        updateAddButtonState();
      }
    });

    load().catch(function(e){
      console.error(e);
      alert("Gagal load data. Cek API_URL & permission Web App.");
    });

    var btnAdd = document.getElementById("btnAdd");
    var btnReload = document.getElementById("btnReload");
    var btnReset = document.getElementById("btnReset");
    var btnPrint = document.getElementById("btnPrint");
    var btnToggleDbg = document.getElementById("btnToggleDbg");
    var qtyEl = document.getElementById("qty");

    if (btnAdd) btnAdd.addEventListener("click", addToCart);

    // Enter pada Qty = Tambah
    if (qtyEl){
      qtyEl.addEventListener("keydown", function(e){
        if (e.key === "Enter"){
          e.preventDefault();
          addToCart();
        }
      });
    }

    if (btnReload) {
      function setReloadLoading(on){
        btnReload.classList.toggle("spin", !!on);
        btnReload.disabled = !!on;
        btnReload.setAttribute("aria-busy", on ? "true" : "false");
        btnReload.title = on ? "Memuat data…" : "Reload data";

        if (on) {
          document.documentElement.setAttribute("data-allow-motion", "true");
        } else {
          document.documentElement.removeAttribute("data-allow-motion");
        }
      }

      btnReload.addEventListener("click", async function(){
        if (btnReload.disabled) return;
        setReloadLoading(true);
        try {
          await load(true);
        } finally {
          setReloadLoading(false);
          updateAddButtonState();
        }
      });
    }

    // if (btnReset) btnReset.addEventListener("click", function(){
    //   cart = [];
    //   renderCart();
    //   console.log("Keranjang direset");
    // });
    // if (btnPrint) btnPrint.addEventListener("click", printReceipt);

    if (btnReset) btnReset.addEventListener("click", async function(){
      var ok = await confirmDialog({
        title: "Reset keranjang?",
        message: "Semua item di keranjang akan dihapus.",
        okText: "Ya, reset",
        cancelText: "Batal"
      });
      if (!ok) return;
      cart = [];
      renderCart();
      console.log("Keranjang direset");
    });

    if (btnPrint) btnPrint.addEventListener("click", async function(){
      var ok = await confirmDialog({
        title: "Cetak struk?",
        message: "Struk akan ditampilkan/dibagikan. Notifikasi admin dikirim satu kali per struk.",
        okText: "Ya, cetak",
        cancelText: "Batal"
      });
      if (!ok) return;
      printReceipt();
    });



    if (btnToggleDbg) btnToggleDbg.addEventListener("click", function(){
      var p = document.getElementById("dbg");
      p.style.display = (p.style.display === "none" || !p.style.display) ? "block" : "none";
    });

    /* ===== THEME TOGGLE ===== */
    var tbtn = document.getElementById("themeToggle");
    if (tbtn){
      var key = "theme";
      function applyTheme(theme){
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem(key, theme); } catch(_) {}
        tbtn.textContent = (theme === "dark") ? "🌙" : "☀️";
        tbtn.title = (theme === "dark") ? "Switch to light mode" : "Switch to dark mode";
        tbtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta){
          meta = document.createElement("meta");
          meta.setAttribute("name","theme-color");
          document.head.appendChild(meta);
        }
        var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
        meta.setAttribute("content", bg || (theme === "dark" ? "#0b0f14" : "#ffffff"));
      }
      var current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current);
      tbtn.addEventListener("click", function(){
        var next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
        applyTheme(next);
      });
    }

    updateAddButtonState();
  });
})();
