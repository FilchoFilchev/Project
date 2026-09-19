const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalculator(extra = {}) {
  const context = vm.createContext({ ...extra });
  for (const file of ['customers.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return context.LeadPredictor;
}

test('customers meet the revenue target, rounded up to whole people', () => {
  const { calculateCustomers } = loadCalculator();
  assert.equal(calculateCustomers(10000, 1000), 10);
  assert.equal(calculateCustomers(10001, 1000), 11);
  assert.equal(calculateCustomers(0, 1000), 0);
  assert.equal(calculateCustomers(0.07, 0.01), 7);
});

test('invalid revenue and order values cannot produce a forecast', () => {
  const { calculateCustomers } = loadCalculator();
  for (const revenue of [-1, NaN, Infinity, '100']) {
    assert.throws(() => calculateCustomers(revenue, 1000));
  }
  for (const order of [0, -1, NaN, Infinity]) {
    assert.throws(() => calculateCustomers(10000, order));
  }
  assert.throws(() => calculateCustomers(Number.MAX_VALUE, 0.01));
});
