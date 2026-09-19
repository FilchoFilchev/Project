"use strict";

// Assume a steady daily pace, shown as cumulative monthly targets.
function buildCampaignGraph(forecast, startValue, endValue) {
  function parseDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(`${value}T`)) {
      throw new RangeError("Choose valid campaign start and end dates.");
    }
    return date;
  }
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (end < start) throw new RangeError("Campaign end must be on or after campaign start.");
  for (const name of ["customers", "leads", "prospects"]) {
    if (!Number.isFinite(forecast[name]) || forecast[name] < 0) {
      throw new RangeError("Enter valid values to view the campaign forecast.");
    }
  }

  // Clamp anniversaries to the last day of shorter months (Jan 31 -> Feb 28).
  function monthEnd(offset) {
    const date = new Date(start);
    date.setUTCDate(1);
    date.setUTCMonth(start.getUTCMonth() + offset);
    const lastDay = new Date(date);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(start.getUTCDate(), lastDay.getUTCDate()));
    return date;
  }

  const wholeMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + end.getUTCMonth() - start.getUTCMonth();
  const months = Math.max(1, wholeMonths + (end > monthEnd(wholeMonths) ? 1 : 0));
  // For long campaigns, show at most 12 representative monthly checkpoints.
  const count = Math.min(months, 12);
  const duration = end - start;
  const rows = Array.from({ length: count }, (_, index) => {
    const month = Math.ceil((index + 1) * months / count);
    const date = new Date(Math.min(monthEnd(month).getTime(), end.getTime()));
    const fraction = duration === 0 ? 1 : (date - start) / duration;
    return {
      month,
      date: date.toISOString().split("T")[0],
      customers: forecast.customers * fraction,
      leads: forecast.leads * fraction,
      prospects: forecast.prospects * fraction,
    };
  });

  // Rounded axis intervals make changing totals visible without clipping bars.
  const maximum = Math.max(1, forecast.prospects);
  const roughStep = maximum / 6;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const factor = [1, 2, 2.5, 5, 10].find(value => value >= roughStep / magnitude);
  const step = (factor || 10) * magnitude;
  const roundedMaximum = Math.ceil(maximum / step) * step;
  const axisMaximum = Number.isFinite(roundedMaximum) ? roundedMaximum : maximum;
  const tickCount = Math.min(6, Math.max(1, Math.round(axisMaximum / step)));
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => axisMaximum * (index / tickCount));
  return { start: startValue, end: endValue, months, rows, axisMaximum, ticks };
}

function describeCampaignRow(row) {
  const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  return `Month ${row.month} · ${row.date}\nProspects: ${format.format(row.prospects)}\nLeads: ${format.format(row.leads)}\nCustomers: ${format.format(row.customers)}`;
}

function renderCampaignGraph(model, viewWidth = 398) {
  const rowHeight = 258 / model.rows.length;
  const plotWidth = viewWidth - 32;
  const width = value => value / model.axisMaximum * plotWidth;
  const format = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
  const grid = model.ticks.map(value => `<path d="M${20 + width(value)} 14V278"/>`);
  const ticks = model.ticks.map(value => `<text x="${20 + width(value)}" y="292">${format.format(value)}</text>`);
  const rows = model.rows.map((row, index) => {
    const y = 20 + index * rowHeight;
    const height = rowHeight - 4;
    const description = describeCampaignRow(row).replaceAll("\n", ", ");
    grid.push(`<path d="M20 ${y + height / 2}H${viewWidth - 12}"/>`);
    return `<g class="chart-month" data-chart-row="${index}" tabindex="0" role="img" aria-label="${description}" aria-describedby="campaign-chart-tooltip">
      <rect class="chart-hit-area" x="20" y="${y}" width="${plotWidth}" height="${height}"/>
      <rect class="bar-prospects" x="20" y="${y}" width="${width(row.prospects)}" height="${height}"/>
      <rect class="bar-leads" x="20" y="${y + 3}" width="${width(row.leads)}" height="${height - 6}"/>
      <rect class="bar-customers" x="20" y="${y + 4}" width="${width(row.customers)}" height="${height - 8}"/>
      <text class="chart-labels chart-month-labels" x="15" y="${y + height / 2 + 2}">${row.month}</text>
    </g>`;
  });
  return `<title id="chart-title">Sales funnel by month</title>
    <desc id="chart-description">${model.start} to ${model.end}. Cumulative targets at a steady daily pace over ${model.months} months, shown at ${model.rows.length} monthly checkpoints. Dark bars: prospects. Medium bars: leads. Light bars: customers.</desc>
    <g class="chart-grid">${grid.join("")}</g>
    ${rows.join("")}
    <path class="chart-axis" d="M20 14V278H${viewWidth - 12}"/>
    <g class="chart-labels chart-tick-labels">${ticks.join("")}</g>
    <text class="chart-axis-title" transform="translate(8 158) rotate(-90)">Months</text>
    <text class="chart-axis-title" x="${20 + plotWidth / 2}" y="304" text-anchor="middle">People</text>`;
}

(() => {
  if (typeof document === "undefined") return;
  const byId = id => document.getElementById(id);
  const svg = byId("campaign-chart-svg");
  const plot = byId("campaign-chart");
  const tooltip = byId("campaign-chart-tooltip");
  const status = byId("campaign-chart-status");
  const form = byId("campaign-form");
  const startInput = byId("campaign-start");
  const endInput = byId("campaign-end");
  const numberInputs = ["total-revenue", "average-order-value", "lead-response-rate", "prospect-response-rate"].map(byId);
  let model;

  function hideTooltip() { tooltip.hidden = true; }

  function drawGraph() {
    if (!model) return;
    // Match the SVG coordinate system to its panel so a wide desktop layout
    // fills the center without stretching text or leaving large empty margins.
    const viewWidth = plot.clientHeight > 0 && plot.clientWidth > 0
      ? Math.max(300, Math.round(306 * plot.clientWidth / plot.clientHeight)) : 398;
    svg.setAttribute("viewBox", `0 0 ${viewWidth} 306`);
    svg.innerHTML = renderCampaignGraph(model, viewWidth);
    // SVGElement does not reflect the HTML .hidden property to the attribute.
    svg.removeAttribute("hidden");
  }

  function updateGraph() {
    hideTooltip();
    startInput.setAttribute("aria-invalid", String(!startInput.validity.valid));
    endInput.setAttribute("aria-invalid", String(!endInput.validity.valid));
    try {
      const invalid = [...numberInputs, startInput, endInput].find(input => !input.validity.valid);
      if (invalid) throw new RangeError(invalid.validationMessage);
      if (endInput.value < startInput.value) endInput.setAttribute("aria-invalid", "true");
      const customers = calculateCustomers(numberInputs[0].valueAsNumber, numberInputs[1].valueAsNumber);
      const leads = calculateLeads(customers, numberInputs[2].valueAsNumber);
      const prospects = calculateProspects(leads, numberInputs[3].valueAsNumber);
      model = buildCampaignGraph({ customers, leads, prospects }, startInput.value, endInput.value);
      drawGraph();
      status.textContent = "";
      status.hidden = true;
    } catch (error) {
      model = null;
      svg.innerHTML = "";
      svg.setAttribute("hidden", "");
      status.textContent = error.message;
      status.hidden = false;
    }
  }

  function showTooltip(event) {
    const element = event.target.closest?.("[data-chart-row]");
    if (!model || !element || !svg.contains(element)) return;
    const index = Number(element.getAttribute("data-chart-row"));
    const row = model.rows[index];
    if (!row) return;
    tooltip.textContent = describeCampaignRow(row);
    tooltip.style.top = `${Math.max(18, Math.min(82, (index + 0.5) / model.rows.length * 100))}%`;
    tooltip.hidden = false;
  }

  svg.addEventListener("pointerover", showTooltip);
  svg.addEventListener("focusin", showTooltip);
  svg.addEventListener("click", showTooltip);
  svg.addEventListener("pointerleave", hideTooltip);
  svg.addEventListener("focusout", hideTooltip);
  svg.addEventListener("keydown", event => {
    if (event.key === "Escape") hideTooltip();
  });
  for (const input of [...numberInputs, startInput, endInput]) {
    input.addEventListener("input", updateGraph);
    input.addEventListener("change", updateGraph);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateGraph();
  });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      hideTooltip();
      drawGraph();
    }).observe(plot);
  }
  updateGraph();
})();
