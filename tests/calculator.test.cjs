const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalculator(extra = {}) {
  const context = vm.createContext({ ...extra });
  for (const file of ['customers.js', 'leads.js', 'prospects.js']) {
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
  assert.equal(calculateCustomers(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  assert.equal(calculateCustomers(4503599627370495.5, 1), 4503599627370496);
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

test('leads account for conversion and round up fractional people', () => {
  const { calculateLeads } = loadCalculator();
  assert.equal(calculateLeads(10, 40), 25);
  assert.equal(calculateLeads(11, 40), 28);
  assert.equal(calculateLeads(10, 100), 10);
  assert.equal(calculateLeads(0, 0), 0);
});

test('unreachable targets and invalid response rates are rejected', () => {
  const { calculateLeads } = loadCalculator();
  for (const rate of [0, -1, 101, NaN, Infinity]) {
    assert.throws(() => calculateLeads(10, rate));
  }
  assert.throws(() => calculateLeads(1.5, 40));
  assert.throws(() => calculateLeads(-1, 40));
});

test('prospects use the prospect response rate and reject unreachable targets', () => {
  const { calculateProspects } = loadCalculator();
  assert.equal(calculateProspects(25, 20), 125);
  assert.equal(calculateProspects(28, 30), 94);
  assert.equal(calculateProspects(25, 100), 25);
  assert.equal(calculateProspects(0, 0), 0);
  for (const rate of [0, -1, 101, NaN, Infinity]) {
    assert.throws(() => calculateProspects(25, rate));
  }
});

test('the complete funnel propagates rounded requirements between stages', () => {
  const { calculateForecast } = loadCalculator();
  assert.deepEqual({ ...calculateForecast(10000, 1000, 40, 20) }, { customers: 10, leads: 25, prospects: 125 });
  assert.deepEqual({ ...calculateForecast(10001, 1000, 40, 30) }, { customers: 11, leads: 28, prospects: 94 });
  assert.deepEqual({ ...calculateForecast(0, 1000, 0, 0) }, { customers: 0, leads: 0, prospects: 0 });
  assert.deepEqual({ ...calculateForecast(10000, 1000, 100, 100) }, { customers: 10, leads: 10, prospects: 10 });
});

test('campaign dates support partial months, same-day campaigns, and leap years', () => {
  const { campaignMonths } = loadCalculator();
  assert.equal(campaignMonths('2026-05-08', '2026-11-04'), 6);
  assert.equal(campaignMonths('2026-05-08', '2026-05-08'), 1);
  assert.equal(campaignMonths('2026-05-08', '2026-06-09'), 2);
  assert.equal(campaignMonths('2024-02-29', '2025-02-28'), 12);
  for (const [start, end] of [['', '2026-11-04'], ['2026-05-08', ''], ['2026-11-04', '2026-05-08'], ['2026-02-30', '2026-03-30']]) {
    assert.throws(() => campaignMonths(start, end));
  }
});

test('monthly targets increase to the exact final totals, including long campaigns', () => {
  const { monthlyForecast } = loadCalculator();
  const totals = { customers: 10, leads: 25, prospects: 125 };
  for (const months of [1, 6, 12, 1200]) {
    const rows = monthlyForecast(totals, months);
    assert.equal(rows.length, Math.min(months, 12));
    assert.deepEqual({ ...rows.at(-1) }, { month: months, ...totals });
    rows.forEach((row, index) => {
      assert.ok(row.prospects >= row.leads && row.leads >= row.customers);
      if (index) assert.ok(row.prospects >= rows[index - 1].prospects);
    });
  }
  assert.equal(monthlyForecast(totals, 6)[2].prospects, 63);
  assert.throws(() => monthlyForecast(totals, 0));
});

// A minimal DOM fixture exercises event wiring and rendered output in Node.
// Browser layout and native control appearance are outside these tests.
function setupPage() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
    elements.set(match[1], {
      attributes, value: attributes.value || '', textContent: '', innerHTML: '',
      firstElementChild: { textContent: '' }, listeners: {},
      style: { setProperty(name, value) { this[name] = value; } },
      get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
      get validity() {
        const value = this.valueAsNumber;
        const valid = attributes.type === 'date' ? Boolean(this.value)
          : Number.isFinite(value) && value >= Number(attributes.min || 0)
            && (!attributes.max || value <= Number(attributes.max));
        return { valid };
      },
      validationMessage: 'Enter a valid value.',
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
    });
  }
  loadCalculator({ document: { getElementById: id => elements.get(id) } });
  return {
    get: id => elements.get(id),
    change(id, value) {
      elements.get(id).value = String(value);
      elements.get('campaign-form').listeners.input();
    },
  };
}

test('page initializes and edits update cards, percentages, sliders, and chart', () => {
  const { get, change } = setupPage();
  assert.equal(get('customers-count').textContent, '10');
  assert.equal(get('leads-count').textContent, '25');
  assert.equal(get('prospects-count').textContent, '125');
  assert.equal(get('leads-meter').value, 20);
  assert.equal(get('customers-percentage').textContent, '8%');
  assert.match(get('campaign-chart').innerHTML, /Month 6: 125 prospects/);
  change('total-revenue', 20000);
  assert.equal(get('customers-count').textContent, '20');
  assert.equal(get('prospects-count').textContent, '250');
  change('lead-response-rate', 50);
  assert.equal(get('leads-count').textContent, '40');
  assert.equal(get('prospects-count').textContent, '200');
  assert.equal(get('lead-response-value').textContent, '50.00%');
  assert.equal(get('lead-response-rate').style['--rate'], '50%');
  change('prospect-response-rate', 40);
  assert.equal(get('prospects-count').textContent, '100');
  assert.equal(get('prospect-response-rate').style['--rate'], '40%');
  change('average-order-value', 2000);
  assert.equal(get('customers-count').textContent, '10');
  assert.equal(get('prospects-count').textContent, '50');
});

test('unreachable and empty inputs clear stale forecasts, and valid inputs recover', () => {
  const { get, change } = setupPage();
  change('lead-response-rate', 0);
  assert.equal(get('prospects-count').textContent, '\u2014');
  assert.equal(get('prospects-meter').value, 0);
  assert.match(get('calculator-status').textContent, /above 0%/);
  assert.equal(get('lead-response-rate').attributes['aria-invalid'], 'true');
  change('lead-response-rate', 40);
  assert.equal(get('prospects-count').textContent, '125');
  assert.equal(get('lead-response-rate').attributes['aria-invalid'], undefined);
  change('average-order-value', '');
  assert.equal(get('customers-count').textContent, '\u2014');
  change('average-order-value', 1000);
  change('total-revenue', 0);
  change('lead-response-rate', 0);
  change('prospect-response-rate', 0);
  assert.equal(get('customers-count').textContent, '0');
  assert.equal(get('prospects-percentage').textContent, '0%');
  assert.doesNotMatch(get('campaign-chart').innerHTML, /NaN|Infinity/);
});

test('invalid dates hide the chart without changing funnel totals and recover on edit', () => {
  const { get, change } = setupPage();
  change('campaign-end', '2026-05-01');
  assert.equal(get('customers-count').textContent, '10');
  assert.match(get('calculator-status').textContent, /on or after/);
  assert.doesNotMatch(get('campaign-chart').innerHTML, /<svg/);
  change('campaign-end', '2026-06-08');
  assert.match(get('campaign-chart').innerHTML, /over 1 month,/);
  let prevented = false;
  get('campaign-form').listeners.submit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
});
