"use strict";

// Formula 02: required leads = customers * 100 / lead response rate.
// Preserve the exact result for the prospects formula in the next stage.
function calculateLeads(customers, responseRate) {
  if (!Number.isFinite(customers) || customers < 0) {
    throw new RangeError("Enter a valid customer target of zero or more.");
  }
  if (!Number.isFinite(responseRate) || responseRate < 0 || responseRate > 100) {
    throw new RangeError("Lead response rate must be between 0% and 100%.");
  }
  if (customers === 0) return 0;
  if (responseRate === 0) {
    throw new RangeError("Lead response rate must be above 0% to reach the customer target.");
  }

  const leads = customers / responseRate * 100;
  if (!Number.isFinite(leads)) {
    throw new RangeError("These values are too large to calculate.");
  }
  return leads;
}

(() => {
  if (typeof document === "undefined") return;

  const revenueInput = document.getElementById("total-revenue");
  const orderValueInput = document.getElementById("average-order-value");
  const rateInput = document.getElementById("lead-response-rate");
  const rateOutput = document.getElementById("lead-response-value");
  const leadCount = document.getElementById("leads-count");
  const form = document.getElementById("campaign-form");
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

  function updateLeads() {
    const rate = rateInput.valueAsNumber;
    const validRate = rateInput.validity.valid && Number.isFinite(rate);
    rateOutput.textContent = validRate ? `${rate.toFixed(2)}%` : "\u2014";
    rateInput.style.setProperty("--rate", validRate ? `${rate}%` : "0%");
    rateInput.setAttribute("aria-valuetext", validRate ? `${rate}%` : "Invalid response rate");
    rateInput.setAttribute("aria-invalid", String(!validRate));

    try {
      const invalidInput = [revenueInput, orderValueInput, rateInput].find(input => !input.validity.valid);
      if (invalidInput) throw new RangeError(invalidInput.validationMessage);

      // Reuse Formula 01, rather than reading the rounded customer card text.
      const customers = calculateCustomers(revenueInput.valueAsNumber, orderValueInput.valueAsNumber);
      if (customers > 0 && rate === 0) rateInput.setAttribute("aria-invalid", "true");
      const leads = calculateLeads(customers, rate);
      leadCount.textContent = numberFormat.format(leads);
      leadCount.setAttribute("aria-label", `Required leads: ${numberFormat.format(leads)}`);
      leadCount.title = `Customers * 100 / lead response rate = ${leads}`;
    } catch (error) {
      leadCount.textContent = "\u2014";
      leadCount.setAttribute("aria-label", error.message);
      leadCount.title = error.message;
    }
  }

  for (const input of [revenueInput, orderValueInput, rateInput]) {
    input.addEventListener("input", updateLeads);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateLeads();
  });
  updateLeads();
})();
