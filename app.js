(function(){
  "use strict";

  // ====== Select kustom util ======
  function createSelect(rootEl, opts){
    var state = { open:false, value:"", options:[], hoverIndex:-1 };
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

    function open(){
      state.open = true;
      rootEl.classList.add("open");
      btn.setAttribute("aria-expanded","true");
      // start dari atas bila diminta; jika tidak, fokus ke item terpilih
      var foundIdx = state.options.findIndex(function(o){ return o.value === state.value; });
      state.hoverIndex = (opts && opts.openFromTop) ? 0 : Math.max(0, foundIdx);
      renderOptions();
      // pastikan scroll selalu dari paling atas saat dibuka
      list.scrollTop = 0;
      list.focus({ preventScroll:true });
      document.addEventListener("click", onDocClick, { capture:true, once:true });
    }
    function close(){
      state.open = false;
      rootEl.classList.remove("open");
      btn.setAttribute("aria-expanded","false");
    }
    function toggle(){ state.open ? close() : open(); }

    function setOptions(options){
      state.options = options.slice();
      if (!state.options.some(function(o){ return o.value === state.value; })){
        state.value = "";
        glabel.textContent = placeholder;
      }
      if (state.open) {
        renderOptions();
        list.scrollTop = 0; // reset posisi scroll jika sedang terbuka
      }
    }

    function setValue(val, emit){
      state.value = val;
      var found = state.options.find(function(o){ return o.value === val; });
      glabel.textContent = found ? found.label : placeholder;
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

    // Pakai click saja (hapus touchstart untuk hindari double-trigger)
    btn.addEventListener("click", toggle);

    return { setOptions:setOptions, setValue:setValue, getValue:getValue, open:open, close:close };
  }

  // ====== App logic ======
  var API_URL = "https://script.google.com/macros/s/AKfycbzUkNj1mQAoKp2sKVR8I4UXXAvUqQNJu3F2zDvni9AJUJq9IK_Z5aRDu2DBG7BqPNmmPQ/exec";
  var data = [];
  var cart = [];

  var opSel, vSel;

  function rupiah(n){ return isNaN(n) ? "0" : Number(n).toLocaleString("id-ID"); }
  function setText(id, txt){ var el = document.getElementById(id); if (el) el.textContent = txt; }

  async function load() {
    var err = document.getElementById("err");
    err.style.display = "none";

    setText("dbg_url", API_URL);
    setText("dbg_status", "-");
    setText("dbg_ct", "-");
    setText("dbg_count", "0");
    setText("dbg_ops", "-");
    setText("dbg_sample", "");
    setText("dbg_raw", "");

    try {
      var url = API_URL + (API_URL.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
      var res = await fetch(url, { cache: "no-store" });
      setText("dbg_status", "HTTP " + res.status);
      setText("dbg_ct", res.headers.get("content-type") || "(tidak ada)");

      var raw = await res.text();
      setText("dbg_raw", raw.slice(0, 600));

      if (!res.ok) throw new Error("HTTP " + res.status);

      var json = JSON.parse(raw);
      var arr = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
      data = arr.map(function(x){
        return {
          operator: String((x && (x.operator != null ? x.operator : x.Operator)) || "").trim(),
          nama: String((x && (x.nama != null ? x.nama : x["Nama Voucher"])) || "").trim(),
          harga: Number((x && (x.harga != null ? x.harga : x.Harga)) || 0)
        };
      }).filter(function(x){ return x.operator && x.nama; });

      setText("dbg_count", String(data.length));
      var ops = Array.from(new Set(data.map(function(d){ return d.operator; }))).sort();
      setText("dbg_ops", ops.join(", ") || "-");
      setText("dbg_sample", JSON.stringify(data.slice(0,3), null, 2));

      buildOperator(ops);
      buildVoucher();
    } catch(e) {
      err.textContent = "Gagal memuat data. Klik tombol Debug untuk lihat detail.";
      err.style.display = "block";
      console.error(e);
    }
  }

  function buildOperator(ops) {
    var options = [{ value:"", label:"--Pilih--"}]
      .concat(ops.map(function(o){ return { value:o, label:o }; }));
    opSel.setOptions(options);
    opSel.setValue("", false);
  }

  function buildVoucher() {
    var op = opSel.getValue();
    var items = data.filter(function(d){ return d.operator === op; });
    var options = [{ value:"", label:"--Pilih--"}]
      .concat(items.map(function(d){ return { value:d.nama, label:(d.nama+" - "+rupiah(d.harga)) }; }));
    vSel.setOptions(options);
    vSel.setValue("", false);
    document.getElementById("qty").value = ""; // Set to empty string
  }

  function addToCart() {
    var op = opSel.getValue();
    var nm = vSel.getValue();
    var qtyInput = document.getElementById("qty").value;
    var qty = parseInt(qtyInput, 10);
    if (!qtyInput || isNaN(qty) || qty <= 0) {
      qty = 1; // Default to 1 if input is empty or invalid
    }
    if (!op || !nm) {
      alert("Pilih operator dan voucher yang valid.");
      return;
    }
    var v = data.find(function(x){ return x.operator === op && x.nama === nm; });
    if (!v) return;

    var exist = cart.find(function(i){ return i.operator === op && i.nama === nm; });
    if (exist) exist.qty += qty;
    else cart.push({ operator: op, nama: nm, harga: v.harga, qty: qty });

    renderCart();
    document.getElementById("qty").value = ""; // Clear input after adding
  }

  function calcTotals() {
    var sub = cart.reduce(function(a,b){ return a + (b.harga * b.qty); }, 0);
    var grand = sub;
    setText("grand", rupiah(grand));
    return { grand: grand };
  }

  // ===== PATCHED: renderCart aman (tanpa innerHTML) + click only =====
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

    // Event delegation: gunakan click saja
    tbody.onclick = function(e){
      var t = e.target;
      if (!(t instanceof Element)) return;
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
        cart.splice(i, 1);
        renderCart();
      }
    };

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

  // ===== PATCHED: printReceipt aman (tanpa innerHTML) + click only =====
  function printReceipt() {
    var totals = calcTotals();
    if (cart.length === 0) {
      alert("Keranjang kosong, tidak ada yang bisa dibagikan.");
      return;
    }
    try {
      var lines = [];
      lines.push("STRUK PEMBELIAN VOUCHER");
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

      var receiptText = lines.join("\n");

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
      pre.textContent = text; // aman dari XSS

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

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", function(){
    opSel = createSelect(document.getElementById("opSelect"), {
      placeholder: "--Pilih--",
      onChange: function(){ buildVoucher(); }
    });
    vSel = createSelect(document.getElementById("voucherSelect"), {
      placeholder: "--Pilih--",
      onChange: function(){ document.getElementById("qty").value = ""; },
      openFromTop: true // selalu mulai dari daftar teratas saat dibuka
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

    if (btnAdd) btnAdd.addEventListener("click", addToCart);
    if (btnReload) btnReload.addEventListener("click", load);
    if (btnReset) btnReset.addEventListener("click", function(){
      cart = [];
      renderCart();
      console.log("Keranjang direset");
    });
    if (btnPrint) btnPrint.addEventListener("click", printReceipt);
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
        // ikon & aksesibilitas
        tbtn.textContent = (theme === "dark") ? "🌙" : "☀️";
        tbtn.title = (theme === "dark") ? "Switch to light mode" : "Switch to dark mode";
        tbtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
        // update meta theme-color untuk status bar mobile
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta){
          meta = document.createElement("meta");
          meta.setAttribute("name","theme-color");
          document.head.appendChild(meta);
        }
        var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
        meta.setAttribute("content", bg || (theme === "dark" ? "#0b0f14" : "#ffffff"));
      }
      // tema awal dari attribute yang sudah diset di <head>
      var current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current);
      // toggle klik
      tbtn.addEventListener("click", function(){
        var next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
        applyTheme(next);
      });
    }
  });
})();
