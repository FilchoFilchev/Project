const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'customers.js'), 'utf8');

function loadCalculator(document) {
  const context = vm.createContext(document ? { document } : {});
  vm.runInContext(source, context);
  return context.calculateCustomers;
}

test('Formula 01 divides revenue by order value without rounding the formula', () => {
  const calculateCustomers = loadCalculator();
  assert.equal(calculateCustomers(10000, 1000), 10);
  assert.equal(calculateCustomers(15000, 1000), 15);
  assert.equal(calculateCustomers(10000, 2000), 5);
  assert.equal(calculateCustomers(10001, 1000), 10.001);
  assert.equal(calculateCustomers(0, 1000), 0);
});

test('invalid values and division by zero cannot produce misleading results', () => {
  const calculateCustomers = loadCalculator();
  for (const revenue of [NaN, -1, Infinity, '10000']) {
    assert.throws(() => calculateCustomers(revenue, 1000));
  }
  for (const order of [NaN, 0, -1, Infinity, '1000']) {
    assert.throws(() => calculateCustomers(10000, order));
  }
  assert.throws(() => calculateCustomers(Number.MAX_VALUE, Number.MIN_VALUE));
});

test('the customer card updates on input and recovers after invalid values', () => {
  const elements = new Map();
  for (const id of ['total-revenue', 'average-order-value', 'customers-count', 'campaign-form']) {
    elements.set(id, {
      valueAsNumber: id === 'total-revenue' ? 10000 : 1000,
      validity: { valid: true }, validationMessage: 'Enter a valid value.',
      attributes: {}, listeners: {}, textContent: '',
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
    });
  }
  loadCalculator({ getElementById: id => elements.get(id) });
  const revenue = elements.get('total-revenue');
  const order = elements.get('average-order-value');
  const count = elements.get('customers-count');
  assert.equal(count.textContent, '10');
  revenue.valueAsNumber = 20000;
  revenue.listeners.input();
  assert.equal(count.textContent, '20');
  order.valueAsNumber = 2000;
  order.listeners.input();
  assert.equal(count.textContent, '10');
  order.validity.valid = false;
  order.valueAsNumber = NaN;
  order.listeners.input();
  assert.equal(count.textContent, '\u2014');
  assert.equal(order.attributes['aria-invalid'], 'true');
  order.validity.valid = true;
  order.valueAsNumber = 1000;
  order.listeners.input();
  assert.equal(count.textContent, '20');
  assert.equal(order.attributes['aria-invalid'], 'false');
  let prevented = false;
  elements.get('campaign-form').listeners.submit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
});
