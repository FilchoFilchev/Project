(() => {
  "use strict";

  const calculator = globalThis.LeadPredictor = {};

  // Allow for floating-point noise before rounding up to whole people.
  calculator.roundPeople = (value) => {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new RangeError("These values produce a forecast too large to calculate accurately.");
    }
    if (value === 0) return 0;
    const tolerance = Number.EPSILON * Math.max(1, value);
    return Math.max(1, Math.ceil(value - tolerance));
  };

  // Formula 01: customers = revenue / average order value.
  calculator.calculateCustomers = (revenue, averageOrderValue) => {
    if (!Number.isFinite(revenue) || revenue < 0) {
      throw new RangeError("Enter a total revenue of zero or more.");
    }
    if (!Number.isFinite(averageOrderValue) || averageOrderValue <= 0) {
      throw new RangeError("Enter an average order value greater than zero.");
    }
    return calculator.roundPeople(revenue / averageOrderValue);
  };
})();
