"use strict";

// Formula 03: required prospects = leads * 100 / prospect response rate.
// Keep the exact result; only the displayed number is formatted.
function calculateProspects(leads, responseRate) {
  if (!Number.isFinite(leads) || leads < 0) {
    throw new RangeError("Enter a valid lead target of zero or more.");
  }
  if (!Number.isFinite(responseRate) || responseRate < 0 || responseRate > 100) {
    throw new RangeError("Prospect response rate must be between 0% and 100%.");
  }
  if (leads === 0) return 0;
  if (responseRate === 0) {
    throw new RangeError("Prospect response rate must be above 0% to reach the lead target.");
  }

  const prospects = leads / responseRate * 100;
  if (!Number.isFinite(prospects)) {
    throw new RangeError("These values are too large to calculate.");
  }
  return prospects;
}

(() => {
  if (typeof document === "undefined") return;

  const revenueInput = document.getElementById("total-revenue");
  const orderValueInput = document.getElementById("average-order-value");
  const leadRateInput = document.getElementById("lead-response-rate");
  const rateInput = document.getElementById("prospect-response-rate");
  const rateOutput = document.getElementById("prospect-response-value");
  const prospectCount = document.getElementById("prospects-count");
  const form = document.getElementById("campaign-form");
  const inputs = [revenueInput, orderValueInput, leadRateInput, rateInput];
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

  // All three cards show their share of the total number of prospects.
  function updatePercentages(forecast) {
    for (const name of ["customers", "leads", "prospects"]) {
      const percentage = forecast && forecast.prospects > 0
        ? forecast[name] / forecast.prospects * 100 : 0;
      const label = forecast ? `${numberFormat.format(percentage)}%` : "\u2014";
      document.getElementById(`${name}-percentage`).textContent = label;
      const meter = document.getElementById(`${name}-meter`);
      meter.value = percentage;
      meter.textContent = label;
      meter.setAttribute("aria-valuetext", forecast ? label : "Forecast unavailable");
    }
  }

  function updateProspects() {
    const rate = rateInput.valueAsNumber;
    const validRate = rateInput.validity.valid && Number.isFinite(rate);
    rateOutput.textContent = validRate ? `${rate.toFixed(2)}%` : "\u2014";
    rateInput.style.setProperty("--rate", validRate ? `${rate}%` : "0%");
    rateInput.setAttribute("aria-valuetext", validRate ? `${rate}%` : "Invalid response rate");
    rateInput.setAttribute("aria-invalid", String(!validRate));

    try {
      const invalidInput = inputs.find(input => !input.validity.valid);
      if (invalidInput) throw new RangeError(invalidInput.validationMessage);

      // Use the original formulas, not the rounded numbers on the cards.
      const customers = calculateCustomers(revenueInput.valueAsNumber, orderValueInput.valueAsNumber);
      const leads = calculateLeads(customers, leadRateInput.valueAsNumber);
      if (leads > 0 && rate === 0) rateInput.setAttribute("aria-invalid", "true");
      const prospects = calculateProspects(leads, rate);
      prospectCount.textContent = numberFormat.format(prospects);
      prospectCount.setAttribute("aria-label", `Required prospects: ${numberFormat.format(prospects)}`);
      prospectCount.title = `Leads * 100 / prospect response rate = ${prospects}`;
      updatePercentages({ customers, leads, prospects });
    } catch (error) {
      prospectCount.textContent = "\u2014";
      prospectCount.setAttribute("aria-label", error.message);
      prospectCount.title = error.message;
      updatePercentages(null);
    }
  }

  for (const input of inputs) {
    input.addEventListener("input", updateProspects);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateProspects();
  });
  updateProspects();
})();
