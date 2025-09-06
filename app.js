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
      state.hoverIndex = Math.max(0, state.options.findIndex(function(o){ return o.value === state.value; }));
      renderOptions();
      list.focus({ preventScroll:true });
      document.addEventListener("click", onDocClick, { capture:true, once:true });
      document.addEventListener("touchstart", onDocClick, { capture:true, once:true });
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
      if (state.open) renderOptions();
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

    btn.addEventListener("click", toggle);
    btn.addEventListener("touchstart", function(e){ e.preventDefault(); toggle(); });

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
    document.getElementById("qty").value = 1;
  }

  function addToCart() {
    var op = opSel.getValue();
    var nm = vSel.getValue();
    var qty = parseInt(document.getElementById("qty").value, 10);
    if (!op || !nm || !qty || qty <= 0) {
      alert("Pilih operator, voucher, dan qty yang valid.");
      return;
    }
    var v = data.find(function(x){ return x.operator === op && x.nama === nm; });
    if (!v) return;

    var exist = cart.find(function(i){ return i.operator === op && i.nama === nm; });
    if (exist) exist.qty += qty;
    else cart.push({ operator: op, nama: nm, harga: v.harga, qty: qty });

    renderCart();
  }

  function calcTotals() {
    var sub = cart.reduce(function(a,b){ return a + (b.harga * b.qty); }, 0);
    var grand = sub;
    setText("grand", rupiah(grand));
    return { grand: grand };
  }

  function renderCart() {
    var tbody = document.querySelector("#cart tbody");
    tbody.innerHTML = "";
    cart.forEach(function(it, idx){
      var sub = it.harga * it.qty;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>"+it.operator+"</td>"+
        "<td>"+it.nama+"</td>"+
        '<td class="right">'+rupiah(it.harga)+'</td>'+
        '<td class="right"><input type="number" min="1" value="'+it.qty+'" data-idx="'+idx+'" class="qty-input"></td>'+
        '<td class="right">'+rupiah(sub)+'</td>'+
        '<td><button data-idx="'+idx+'" class="btn btn-ghost">Hapus</button></td>';
      tbody.appendChild(tr);
    });

    Array.from(tbody.querySelectorAll(".qty-input")).forEach(function(inp){
      inp.addEventListener("change", function(e){
        var i = parseInt(e.target.getAttribute("data-idx"), 10);
        var val = Math.max(1, parseInt(e.target.value, 10) || 1);
        cart[i].qty = val;
        renderCart();
      });
    });
    Array.from(tbody.querySelectorAll(".btn.btn-ghost")).forEach(function(btn){
      btn.addEventListener("click", function(e){
        var i = parseInt(e.target.getAttribute("data-idx"), 10);
        cart.splice(i, 1);
        renderCart();
      });
    });

    calcTotals();
  }

  function printReceipt() {
    var totals = calcTotals();
    if (cart.length === 0) {
      alert("Keranjang kosong, tidak ada yang bisa dibagikan.");
      return;
    }
    try {
      // var lines = [];
      // lines.push("[NAMA TOKO ANDA]");
      // lines.push("Jl. Alamat Toko No. 123");
      // lines.push("--------------------------------");
      
      // // Calculate the maximum length for alignment
      // var maxLength = 32; // Assuming 32 characters is the desired width for receipt
      // cart.forEach(function(it){
      //   var subtotal = rupiah(it.harga * it.qty);
      //   var qtyLine = it.qty + " x " + rupiah(it.harga);
      //   var padding = " ".repeat(maxLength - qtyLine.length - subtotal.length - 4); // Adjust padding
      //   lines.push("["+it.operator+"] "+it.nama);
      //   lines.push("  " + qtyLine + padding + "=  " + subtotal);
      // });
      // lines.push("--------------------------------");
      // var totalLabel = "TOTAL    : ";
      // var totalValue = rupiah(totals.grand);
      // var totalPadding = " ".repeat(maxLength - totalLabel.length - totalValue.length);
      // lines.push(totalLabel + totalPadding + totalValue);
      // lines.push(new Date().toLocaleString("id-ID"));
      // lines.push("Terima kasih.");

      var lines = [];
      lines.push("[NAMA TOKO ANDA]");
      lines.push("Jl. Alamat Toko No. 123");
      lines.push("--------------------------------");

      var maxLength = 32; // lebar struk
      cart.forEach(function(it){
        var subtotal = rupiah(it.harga * it.qty);
        var qtyLine = it.qty + " x " + rupiah(it.harga);

        // panjang kiri (qtyLine + spasi + tanda '=')
        var leftPart = qtyLine + " =";
        var padding = " ".repeat(maxLength - leftPart.length - subtotal.length);

        lines.push("[" + it.operator + "] " + it.nama);
        lines.push("  " + leftPart + padding + subtotal);
      });

      lines.push("--------------------------------");
      var totalLabel = "TOTAL :";
      var totalValue = rupiah(totals.grand);
      var totalPadding = " ".repeat(maxLength - totalLabel.length - totalValue.length);
      lines.push(totalLabel + totalPadding + totalValue);

      lines.push(new Date().toLocaleString("id-ID"));
      lines.push("Terima kasih.");

      var receiptText = lines.join("\n");

      if (navigator.share) {
        navigator.share({
          title: "Struk Pembelian",
          text: receiptText
        }).catch(function(e) {
          console.error("Gagal membagikan struk:", e);
          // Fallback: Tampilkan struk di dalam div di halaman saat ini
          var struk = document.createElement("div");
          struk.style.position = "fixed";
          struk.style.top = "0";
          struk.style.left = "0";
          struk.style.width = "100%";
          struk.style.height = "100%";
          struk.style.background = "rgba(0,0,0,0.8)";
          struk.style.color = "#fff";
          struk.style.padding = "20px";
          struk.style.zIndex = "1000";
          struk.style.overflowY = "auto";
          struk.innerHTML = "<pre>" + receiptText + "</pre><button onclick='this.parentElement.remove()'>Tutup</button>";
          document.body.appendChild(struk);
        });
      } else {
        // Fallback jika Web Share API tidak didukung
        var struk = document.createElement("div");
        struk.style.position = "fixed";
        struk.style.top = "0";
        struk.style.left = "0";
        struk.style.width = "100%";
        struk.style.height = "100%";
        struk.style.background = "rgba(0,0,0,0.8)";
        struk.style.color = "#fff";
        struk.style.padding = "20px";
        struk.style.zIndex = "1000";
        struk.style.overflowY = "auto";
        struk.innerHTML = "<pre>" + receiptText + "</pre><button onclick='this.parentElement.remove()'>Tutup</button>";
        document.body.appendChild(struk);
        alert("Fitur berbagi tidak didukung di browser ini. Struk ditampilkan di layar.");
      }
    } catch(e) {
      console.error("Error saat membagikan struk:", e);
      alert("Gagal membagikan struk. Cek konsol untuk detail atau coba lagi.");
    }
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", function(){
    opSel = createSelect(document.getElementById("opSelect"), {
      placeholder: "--Pilih--",
      onChange: function(){ buildVoucher(); document.getElementById("qty").value = 1; }
    });
    vSel = createSelect(document.getElementById("voucherSelect"), {
      placeholder: "--Pilih--",
      onChange: function(){ document.getElementById("qty").value = 1; }
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
  });
})();
