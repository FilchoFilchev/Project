(() => {
  "use strict";

  const calculator = globalThis.LeadPredictor;

  // Formula 03: prospects = leads * 100 / prospect response rate.
  calculator.calculateProspects = (leads, responseRate) =>
    calculator.requiredAudience(leads, responseRate, "Prospect response rate");

  calculator.calculateForecast = (revenue, orderValue, leadRate, prospectRate) => {
    const customers = calculator.calculateCustomers(revenue, orderValue);
    const leads = calculator.calculateLeads(customers, leadRate);
    const prospects = calculator.calculateProspects(leads, prospectRate);
    return { customers, leads, prospects };
  };

  calculator.campaignMonths = (startValue, endValue) => {
    const start = new Date(`${startValue}T00:00:00Z`);
    const end = new Date(`${endValue}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new RangeError("Choose valid campaign start and end dates.");
    }
    if (!start.toISOString().startsWith(`${startValue}T`) || !end.toISOString().startsWith(`${endValue}T`)) {
      throw new RangeError("Choose valid campaign start and end dates.");
    }
    if (end < start) {
      throw new RangeError("Campaign end must be on or after campaign start.");
    }
    // Count calendar months from the start date; include a final partial month.
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
      + end.getUTCMonth() - start.getUTCMonth();
    return Math.max(1, months + (end.getUTCDate() > start.getUTCDate() ? 1 : 0));
  };

  calculator.monthlyForecast = (forecast, months) => {
    if (!Number.isSafeInteger(months) || months < 1) {
      throw new RangeError("Campaign duration must be at least one month.");
    }
    // Keep long campaigns legible by showing up to 12 evenly spaced checkpoints.
    const checkpoints = Math.min(months, 12);
    return Array.from({ length: checkpoints }, (_, index) => {
      const month = Math.ceil((index + 1) * months / checkpoints);
      const fraction = month / months;
      return {
        month,
        customers: calculator.roundPeople(forecast.customers * fraction),
        leads: calculator.roundPeople(forecast.leads * fraction),
        prospects: calculator.roundPeople(forecast.prospects * fraction),
      };
    });
  };

  // The UI connects all three formulas; deferred classic scripts also work
  // when index.html is opened directly, without a development server.
  if (typeof document === "undefined") return;

  const byId = (id) => document.getElementById(id);
  const form = byId("campaign-form");
  const chart = byId("campaign-chart");
  const status = byId("calculator-status");
  const fields = {
    revenue: byId("total-revenue"),
    order: byId("average-order-value"),
    leadRate: byId("lead-response-rate"),
    prospectRate: byId("prospect-response-rate"),
    start: byId("campaign-start"),
    end: byId("campaign-end"),
  };
  const numberFormat = new Intl.NumberFormat("en-US");
  const percentFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

  function updateSliders() {
    for (const name of ["lead", "prospect"]) {
      const input = byId(`${name}-response-rate`);
      const rate = input.valueAsNumber;
      byId(`${name}-response-value`).textContent = `${rate.toFixed(2)}%`;
      input.style.setProperty("--rate", `${rate}%`);
      input.setAttribute("aria-valuetext", `${rate}%`);
    }
  }

  function updateCards(forecast) {
    for (const name of ["customers", "leads", "prospects"]) {
      const percentage = forecast && forecast.prospects > 0
        ? forecast[name] / forecast.prospects * 100 : 0;
      const label = forecast ? `${percentFormat.format(percentage)}%` : "\u2014";
      byId(`${name}-count`).textContent = forecast ? numberFormat.format(forecast[name]) : "\u2014";
      byId(`${name}-percentage`).textContent = label;
      const meter = byId(`${name}-meter`);
      meter.value = percentage;
      meter.textContent = label;
      meter.setAttribute("aria-valuetext", forecast ? label : "Forecast unavailable");
    }
  }

  function renderChart(forecast, months) {
    const rows = calculator.monthlyForecast(forecast, months);
    const maximum = Math.max(1, forecast.prospects);
    const rowHeight = 258 / rows.length;
    const width = (value) => value / maximum * 366;
    const grid = [];
    const ticks = [];
    // Integer tick labels remain readable even for tiny and very large totals.
    const tickCount = Math.min(6, maximum);
    const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
    for (let index = 0; index <= tickCount; index++) {
      const value = Math.round(index * maximum / tickCount);
      const x = 20 + width(value);
      grid.push(`<path d="M${x} 14V278"/>`);
      ticks.push(`<text x="${x}" y="292">${compact.format(value)} people</text>`);
    }
    const bars = rows.map((row, index) => {
      const y = 20 + rowHeight * index;
      const height = rowHeight - 4;
      const description = `Month ${row.month}: ${numberFormat.format(row.prospects)} prospects, ${numberFormat.format(row.leads)} leads, ${numberFormat.format(row.customers)} customers`;
      grid.push(`<path d="M20 ${y + height / 2}H386"/>`);
      return `<g class="chart-month" tabindex="0" role="img" aria-label="${description}">
        <title>${description}</title>
        <rect class="bar-prospects" x="20" y="${y}" width="${width(row.prospects)}" height="${height}"/>
        <rect class="bar-leads" x="20" y="${y + 3}" width="${width(row.leads)}" height="${height - 6}"/>
        <rect class="bar-customers" x="20" y="${y + 4}" width="${width(row.customers)}" height="${height - 8}"/>
        <text class="chart-labels chart-month-labels" x="15" y="${y + height / 2 + 2}">${row.month}</text>
      </g>`;
    });
    chart.innerHTML = `<svg class="funnel-chart" viewBox="0 0 398 306" role="group" aria-labelledby="chart-title chart-description">
      <title id="chart-title">Sales funnel by month</title>
      <desc id="chart-description">Cumulative targets spread evenly over ${months} ${months === 1 ? "month" : "months"}, shown at ${rows.length} checkpoints. Dark bars: prospects. Medium bars: leads. Light bars: customers.</desc>
      <g class="chart-grid">${grid.join("")}</g>
      ${bars.join("")}
      <path class="chart-axis" d="M20 14V278H386"/>
      <g class="chart-labels chart-tick-labels">${ticks.join("")}</g>
      <text class="chart-axis-title" transform="translate(8 158) rotate(-90)">Months</text>
    </svg>`;
  }

  function showChartError(message) {
    chart.innerHTML = '<p class="chart-status"></p>';
    chart.firstElementChild.textContent = message;
    status.textContent = message;
  }

  function updateCalculator() {
    updateSliders();
    for (const field of Object.values(fields)) field.removeAttribute("aria-invalid");
    let forecast;
    try {
      const numberFields = [fields.revenue, fields.order, fields.leadRate, fields.prospectRate];
      const invalid = numberFields.find((field) => !field.validity.valid);
      if (invalid) {
        invalid.setAttribute("aria-invalid", "true");
        throw new RangeError(invalid.validationMessage);
      }
      // Native range validation allows zero; a positive target does not.
      if (fields.revenue.valueAsNumber > 0) {
        for (const rate of [fields.leadRate, fields.prospectRate]) {
          if (rate.valueAsNumber === 0) rate.setAttribute("aria-invalid", "true");
        }
      }
      forecast = calculator.calculateForecast(fields.revenue.valueAsNumber,
        fields.order.valueAsNumber, fields.leadRate.valueAsNumber, fields.prospectRate.valueAsNumber);
      updateCards(forecast);
    } catch (error) {
      updateCards(null);
      showChartError(error.message);
      return;
    }

    // Dates affect the monthly breakdown, not the required funnel totals.
    try {
      const invalidDate = [fields.start, fields.end].find((field) => !field.validity.valid);
      if (invalidDate) {
        invalidDate.setAttribute("aria-invalid", "true");
        throw new RangeError("Choose valid campaign start and end dates.");
      }
      if (fields.end.value < fields.start.value) fields.end.setAttribute("aria-invalid", "true");
      const months = calculator.campaignMonths(fields.start.value, fields.end.value);
      renderChart(forecast, months);
      status.textContent = `Required: ${numberFormat.format(forecast.customers)} customers, ${numberFormat.format(forecast.leads)} leads, and ${numberFormat.format(forecast.prospects)} prospects over ${months} ${months === 1 ? "month" : "months"}.`;
    } catch (error) {
      showChartError(error.message);
    }
  }

  form.addEventListener("input", updateCalculator);
  form.addEventListener("change", updateCalculator);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updateCalculator();
  });
  updateCalculator();
})();
