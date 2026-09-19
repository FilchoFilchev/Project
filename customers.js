"use strict";

// Formula 01: required customers = total revenue / average order value.
// Keep the exact result so subsequent formulas can use it without rounding.
function calculateCustomers(totalRevenue, averageOrderValue) {
  if (!Number.isFinite(totalRevenue) || totalRevenue < 0) {
    throw new RangeError("Enter a total revenue of zero or more.");
  }
  if (!Number.isFinite(averageOrderValue) || averageOrderValue <= 0) {
    throw new RangeError("Enter an average order value greater than zero.");
  }

  const customers = totalRevenue / averageOrderValue;
  if (!Number.isFinite(customers)) {
    throw new RangeError("These values are too large to calculate.");
  }
  return customers;
}

(() => {
  if (typeof document === "undefined") return;

  const revenueInput = document.getElementById("total-revenue");
  const orderValueInput = document.getElementById("average-order-value");
  const customerCount = document.getElementById("customers-count");
  const form = document.getElementById("campaign-form");
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

  function updateCustomers() {
    for (const input of [revenueInput, orderValueInput]) {
      input.setAttribute("aria-invalid", String(!input.validity.valid));
    }

    try {
      const invalidInput = [revenueInput, orderValueInput].find(input => !input.validity.valid);
      if (invalidInput) throw new RangeError(invalidInput.validationMessage);

      const customers = calculateCustomers(revenueInput.valueAsNumber, orderValueInput.valueAsNumber);
      customerCount.textContent = numberFormat.format(customers);
      customerCount.setAttribute("aria-label", `Required customers: ${numberFormat.format(customers)}`);
      customerCount.title = `Revenue / average order value = ${customers}`;
    } catch (error) {
      customerCount.textContent = "\u2014";
      customerCount.setAttribute("aria-label", error.message);
      customerCount.title = error.message;
    }
  }

  revenueInput.addEventListener("input", updateCustomers);
  orderValueInput.addEventListener("input", updateCustomers);
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateCustomers();
  });
  updateCustomers();
})();
