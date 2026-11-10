// Quotation costing engine. Pure functions, no DB. The Admin Dash keeps an
// identical copy (src/components/quotes/quoteEngine.js) for live UI math;
// tests/quoteEngine.test.js pins the formulas both must follow.
//
//   Unit price  = price_override, else ceil((OSP ÷ SM) / step) × step
//   SM          = the line's sm_override, else the quote's SM
//   Amount      = qty × unit price;  GST = amount × gst_rate%
//   Margin ₹    = amount − qty × OSP

export const ROUNDING_STEPS = [1, 10, 100, 1000];

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

// The epsilon keeps float noise (e.g. 12.000000001) from rounding up a step.
export function roundUpToStep(value, step) {
  const s = ROUNDING_STEPS.includes(Number(step)) ? Number(step) : 1;
  if (value <= 0) return 0;
  return Math.ceil(value / s - 1e-9) * s;
}

export function hasOverride(line) {
  return line.sm_override != null || line.price_override != null;
}

export function computeLine(line, { sm, rounding_step }) {
  const qty = num(line.qty);
  const osp = num(line.osp_unit);
  const effectiveSm = line.sm_override != null ? num(line.sm_override) : num(sm);
  const unitPrice = line.price_override != null
    ? round2(line.price_override)
    : (effectiveSm > 0 ? roundUpToStep(osp / effectiveSm, rounding_step) : 0);
  const amount = round2(qty * unitPrice);
  const gst = round2(amount * num(line.gst_rate) / 100);
  const ospTotal = round2(qty * osp);
  const margin = round2(amount - ospTotal);
  return {
    sm: effectiveSm,
    unit_price: unitPrice,
    amount,
    gst,
    total: round2(amount + gst),
    osp_total: ospTotal,
    margin,
    margin_pct: amount > 0 ? round2((margin / amount) * 100) : 0
  };
}

const emptyTotals = () => ({ supply_osp: 0, supply_price: 0, services_osp: 0, services_price: 0, gst_total: 0 });

function addLine(totals, line, calc) {
  if (line.line_type === 'service') {
    totals.services_osp += calc.osp_total;
    totals.services_price += calc.amount;
  } else {
    totals.supply_osp += calc.osp_total;
    totals.supply_price += calc.amount;
  }
  totals.gst_total += calc.gst;
}

function finish(totals) {
  const out = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)]));
  const price = out.supply_price + out.services_price;
  const osp = out.supply_osp + out.services_osp;
  out.subtotal = round2(price);
  out.grand_total = round2(price + out.gst_total);
  out.margin = round2(price - osp);
  out.margin_pct = price > 0 ? round2(((price - osp) / price) * 100) : 0;
  return out;
}

// version: { sm, rounding_step, sections: [{ lines: [...] }] }
export function computeVersion(version) {
  const settings = { sm: version.sm, rounding_step: version.rounding_step };
  const grand = emptyTotals();
  const sections = (version.sections || []).map((section) => {
    const totals = emptyTotals();
    const lines = (section.lines || []).map((line) => {
      const calc = computeLine(line, settings);
      addLine(totals, line, calc);
      addLine(grand, line, calc);
      return { ...line, calc };
    });
    return { ...section, lines, totals: finish(totals) };
  });
  return { sections, totals: finish(grand) };
}
