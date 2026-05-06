/* ============================================================
   PRODUCT REGISTRY
============================================================ */
const PRODUCTS = {
  emas: {
    id: "emas",
    label: "Kredit Emas",
    icon: "🥇",
    desc: "Pembiayaan logam mulia",
    color: "#C9922A",

    config: {
      MIN_DP_RATE: 0.15,
      INSURANCE_FLAT: 100_000,
      RATES: { 12: 0.11, 24: 0.12, 36: 0.13, 48: 0.13, 60: 0.13 },
    },

    fields: [
      {
        id: "nominal",
        label: "Nilai Emas",
        required: true,
        type: "currency",
        placeholder: "Contoh: 20.000.000",
        span: 2,
      },
      {
        id: "dp",
        label: "Uang Muka (DP)",
        required: true,
        type: "currency",
        placeholder: "Minimal 15% dari nilai emas",
        span: 1,
      },
      {
        id: "tenor",
        label: "Tenor",
        required: true,
        type: "select",
        options: [
          { value: "", label: "Pilih tenor" },
          { value: "12", label: "12 bulan" },
          { value: "24", label: "24 bulan" },
          { value: "36", label: "36 bulan" },
          { value: "48", label: "48 bulan" },
          { value: "60", label: "60 bulan" },
        ],
        span: 1,
      },
    ],

    calculate(values) {
      const nominal = values.nominal;
      const dpInput = values.dp || 0;
      const tenor = Number(values.tenor);
      const cfg = this.config;

      if (!nominal || !tenor || !cfg.RATES[tenor]) return null;

      const minDP = Math.round(nominal * cfg.MIN_DP_RATE);
      const dp = Math.max(dpInput, minDP);

      const plafond = nominal - dp;
      const insurance = cfg.INSURANCE_FLAT;
      const totalDP = dp + insurance;

      const monthlyRate = Math.round((cfg.RATES[tenor] / 12) * 10_000) / 10_000;
      const pokok = Math.round(plafond / tenor);
      const bunga = Math.round(plafond * monthlyRate);
      const angsuran = Math.round(pokok + bunga);

      let sisa = plafond;
      const rows = [];
      let totalPokok = 0,
        totalBunga = 0;

      for (let i = 1; i <= tenor; i++) {
        sisa -= pokok;
        totalPokok += pokok;
        totalBunga += bunga;

        rows.push({
          bulan: i,
          pokok: pokok,
          bunga: bunga,
          angsuran: angsuran,
          sisa: Math.max(sisa, 0),
        });
      }

      return {
        kpis: [
          {
            label: "Total Uang Muka",
            value: totalDP,
            sub: `DP + Asuransi`,
            highlight: true,
          },
          {
            label: "Plafond Kredit",
            value: plafond,
            sub: `Nilai Emas - DP`,
          },
          {
            label: "Angsuran / Bulan",
            value: angsuran,
            sub: `${cfg.RATES[tenor] * 100}% p.a. flat`,
          },
          {
            label: "Total Bunga",
            value: totalBunga,
            sub: `Selama ${tenor} bulan`,
          },
        ],
        tableHead: ["Bulan", "Pokok", "Bunga", "Angsuran", "Sisa Pokok"],
        tableAlign: ["center", "right", "right", "right", "left"],
        rows,
        totalRow: ["Total", fmt(totalPokok), fmt(totalBunga), fmt(totalPokok + totalBunga), "—"],
        csvRows: rows.map((r) => [r.bulan, r.pokok, r.bunga, r.angsuran, r.sisa]),
        csvHead: ["Bulan", "Pokok", "Bunga", "Angsuran", "Sisa Pokok"],
        tenor,
        rate: cfg.RATES[tenor],
      };
    },
  },
};

/* ============================================================
   STATE
============================================================ */
let activeProduct = "emas";
let lastResult = null;
let pendingDPValue = 0;

/* ============================================================
   UTILITIES
============================================================ */
function fmt(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function parseRupiah(s) {
  return Number(String(s).replace(/[^\d]/g, "")) || 0;
}

function showToast(msg, duration = 2500) {
  const el = document.getElementById("toast");
  el.innerHTML = `✅ ${msg}`;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

/* ============================================================
   FORMAT RUPIAH
============================================================ */
function formatInputRupiah(e) {
  let v = e.target.value.replace(/[^\d]/g, "");
  e.target.value = v ? "Rp " + Number(v).toLocaleString("id-ID") : "";
}

/* ============================================================
   BUILD TABS & FORM
============================================================ */
function buildTabs() {
  const wrap = document.getElementById("productTabs");
  wrap.innerHTML = "";

  Object.values(PRODUCTS).forEach((p) => {
    const btn = document.createElement("button");
    btn.className = `product-tab ${p.id === activeProduct ? "active" : ""}`;
    btn.innerHTML = `<span class="tab-icon">${p.icon}</span> ${p.label}`;
    btn.addEventListener("click", () => {
      activeProduct = p.id;
      buildTabs();
      buildForm();
      resetResult();
    });
    wrap.appendChild(btn);
  });
}

function buildForm() {
  const p = PRODUCTS[activeProduct];
  document.getElementById("cardIcon").textContent = p.icon;
  document.getElementById("cardTitle").textContent = p.label;
  document.getElementById("cardDesc").textContent = p.desc;

  const grid = document.getElementById("formFields");
  grid.innerHTML = "";

  p.fields.forEach((f) => {
    const div = document.createElement("div");
    div.className = "field" + (f.span === 2 ? " span-2" : "");

    let inputHtml = "";

    if (f.type === "currency") {
      inputHtml = `
        <div class="input-wrap">
          <span class="input-prefix">Rp</span>
          <input class="has-prefix" id="field_${f.id}" type="text" inputmode="numeric" placeholder="${f.placeholder}" autocomplete="off"/>
        </div>`;
    } else if (f.type === "select") {
      const opts = f.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
      inputHtml = `<select id="field_${f.id}">${opts}</select>`;
    }

    div.innerHTML = `
      <label for="field_${f.id}">${f.label}<span class="req">*</span></label>
      ${inputHtml}
    `;

    grid.appendChild(div);

    const input = document.getElementById(`field_${f.id}`);

    if (f.type === "currency") {
      input.addEventListener("input", formatInputRupiah);
      input.addEventListener("blur", handleDPBlur);
      input.addEventListener("input", debouncedHitung);
    } else {
      input.addEventListener("change", debouncedHitung);
    }

    if (f.id === "dp") {
      const info = document.createElement("div");
      info.className = "insurance-info";
      info.innerHTML = `<small>+ Biaya Asuransi Rp 100.000</small>`;
      div.appendChild(info);
    }
  });
}

/* ==================== CUSTOM MODAL LOGIC ==================== */
const modal = document.getElementById("dpModal");
const modalMessage = document.getElementById("modalMessage");
const modalConfirm = document.getElementById("modalConfirm");
const modalCancel = document.getElementById("modalCancel");

let currentNominal = 0;
let currentMinDP = 0;

function showDPWarning(minDP) {
  currentMinDP = minDP;
  modalMessage.textContent = `Nilai uang muka kurang dari ketentuan minimal. Minimal nominal adalah ${fmt(minDP)}. Apakah anda ingin menggunakan nilai ini ?`;
  modal.classList.add("show");
}

modalConfirm.addEventListener("click", () => {
  const dpEl = document.getElementById("field_dp");
  if (dpEl) {
    dpEl.value = "Rp " + currentMinDP.toLocaleString("id-ID");
    showToast(`DP diatur ke minimum ${fmt(currentMinDP)}`, 2200);
  }
  modal.classList.remove("show");
  debouncedHitung();
});

modalCancel.addEventListener("click", () => {
  modal.classList.remove("show");
});

/* ============================================================
   DP WARNING
============================================================ */
function handleDPBlur() {
  const dpEl = document.getElementById("field_dp");
  const nominalEl = document.getElementById("field_nominal");

  if (!dpEl || !nominalEl) return;

  const nominal = parseRupiah(nominalEl.value);
  const dpInput = parseRupiah(dpEl.value);
  const minDP = Math.round(nominal * PRODUCTS.emas.config.MIN_DP_RATE);

  if (nominal > 0 && dpInput > 0 && dpInput < minDP) {
    currentNominal = nominal;
    showDPWarning(minDP);
  }
}

/* ============================================================
   COLLECT VALUES
============================================================ */
function collectValues() {
  const p = PRODUCTS[activeProduct];
  const out = {};

  p.fields.forEach((f) => {
    const el = document.getElementById("field_" + f.id);
    if (!el) return;
    let val = f.type === "currency" ? parseRupiah(el.value) : el.value;

    if (f.id === "dp") {
      const nominal = parseRupiah(document.getElementById("field_nominal").value);
      const minDP = Math.round(nominal * p.config.MIN_DP_RATE);
      val = Math.max(val, minDP);
    }
    out[f.id] = val;
  });
  return out;
}

/* ============================================================
   DEBOUNCE & CALCULATION
============================================================ */
function debounce(fn, delay = 450) {
  let timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(fn, delay);
  };
}

function hitungSilent() {
  const values = collectValues();
  if (values.nominal && values.tenor) _compute(values);
}

const debouncedHitung = debounce(hitungSilent);

function _compute(values) {
  const result = PRODUCTS[activeProduct].calculate(values);
  if (!result) return;
  lastResult = result;
  renderResult(result);
}

/* ============================================================
   RENDER RESULT (LENGKAP)
============================================================ */
function renderResult(r) {
  // KPI
  const kpiGrid = document.getElementById("kpiGrid");
  kpiGrid.innerHTML = r.kpis
    .map(
      (k) => `
    <div class="kpi-card ${k.highlight ? "highlight" : ""}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${fmt(k.value)}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `,
    )
    .join("");

  // Table Header
  document.getElementById("tablePill").textContent = `${r.tenor} bulan · ${(r.rate * 100).toFixed(0)}% p.a.`;

  document.getElementById("tableHead").innerHTML = `<tr>
    ${r.tableHead.map((h, i) => `<th class="${r.tableAlign[i] || ""}">${h}</th>`).join("")}
  </tr>`;

  const plafond = r.rows[0] ? r.rows[0].sisa + r.rows[0].pokok : 0;

  // Table Body
  document.getElementById("tableBody").innerHTML = r.rows
    .map((row) => {
      const barPct = plafond > 0 ? Math.round((row.sisa / plafond) * 100) : 0;
      return `<tr>
      <td class="center"><span class="badge-bulan">${row.bulan}</span></td>
      <td class="right mono">${fmt(row.pokok)}</td>
      <td class="right mono">${fmt(row.bunga)}</td>
      <td class="right mono">${fmt(row.angsuran)}</td>
      <td>
        <div class="bar-wrap">
          <div class="bar-bg"><div class="bar-fill" style="width:${barPct}%"></div></div>
          <span class="bar-text">${fmt(row.sisa)}</span>
        </div>
      </td>
    </tr>`;
    })
    .join("");

  // Table Footer
  document.getElementById("tableFoot").innerHTML = `<tr>
    ${r.totalRow.map((v, i) => `<td class="${r.tableAlign[i] === "right" ? "right mono" : ""}">${v}</td>`).join("")}
  </tr>`;

  document.getElementById("resultSection").classList.add("visible");
}

/* ============================================================
   OTHER FUNCTIONS
============================================================ */
function resetResult() {
  document.getElementById("resultSection").classList.remove("visible");
  lastResult = null;
}

function exportCSV() {
  if (!lastResult) return;
  const r = lastResult;
  const p = PRODUCTS[activeProduct];

  const lines = [r.csvHead.join(",")];
  r.csvRows.forEach((row) => lines.push(row.join(",")));

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `simulasi_${p.id}_${r.tenor}bulan.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast("File CSV berhasil diunduh");
}

/* ============================================================
   INIT
============================================================ */
(function init() {
  buildTabs();
  buildForm();
})();

document.getElementById("year").textContent = new Date().getFullYear();
