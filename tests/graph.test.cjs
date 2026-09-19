const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const files = ['customers.js', 'leads.js', 'prospects.js', 'graph.js'];
function load(document) {
  const context = vm.createContext(document ? { document } : {});
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  return context;
}
const forecast = { customers: 10, leads: 25, prospects: 125 };

test('graph distributes cumulative totals by elapsed time and ends at the exact totals', () => {
  const { buildCampaignGraph } = load();
  const model = buildCampaignGraph(forecast, '2026-05-08', '2026-11-04');
  assert.equal(model.months, 6);
  assert.equal(model.rows.length, 6);
  assert.equal(model.rows[0].date, '2026-06-08');
  assert.ok(Math.abs(model.rows[0].prospects - 125 * 31 / 180) < 1e-10);
  assert.deepEqual({ ...model.rows.at(-1) }, { month: 6, date: '2026-11-04', ...forecast });
  assert.ok(model.axisMaximum >= forecast.prospects);
  assert.equal(model.ticks[0], 0);
  assert.equal(model.ticks.at(-1), model.axisMaximum);
});

test('dates handle short months, leap years, same-day campaigns and invalid ranges', () => {
  const { buildCampaignGraph } = load();
  const short = buildCampaignGraph(forecast, '2026-01-31', '2026-03-31');
  assert.equal(short.months, 2);
  assert.equal(short.rows[0].date, '2026-02-28');
  assert.equal(buildCampaignGraph(forecast, '2024-01-31', '2024-03-31').rows[0].date, '2024-02-29');
  assert.equal(buildCampaignGraph(forecast, '2026-05-08', '2026-05-08').rows[0].prospects, 125);
  assert.equal(buildCampaignGraph(forecast, '2026-05-08', '2026-06-09').months, 2);
  for (const [start, end] of [['', '2026-05-08'], ['2026-05-08', ''], ['2026-02-30', '2026-05-08'], ['2026-05-09', '2026-05-08']]) {
    assert.throws(() => buildCampaignGraph(forecast, start, end));
  }
});

test('long campaigns stay bounded, and zero and very large forecasts produce finite coordinates', () => {
  const { buildCampaignGraph, renderCampaignGraph } = load();
  const long = buildCampaignGraph(forecast, '2026-01-01', '2126-01-01');
  assert.equal(long.months, 1200);
  assert.equal(long.rows.length, 12);
  assert.equal(long.rows.at(-1).month, 1200);
  for (const total of [0, 0.001, 125, Number.MAX_VALUE]) {
    const model = buildCampaignGraph({ customers: total / 10, leads: total / 5, prospects: total }, '2026-01-01', '2026-07-01');
    const markup = renderCampaignGraph(model);
    assert.doesNotMatch(markup, /NaN|Infinity/);
    assert.ok(model.axisMaximum > 0);
    for (const match of markup.matchAll(/width="([^"]+)"/g)) {
      assert.ok(Number(match[1]) >= 0 && Number(match[1]) <= 366);
    }
  }
});

function setupPage() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, files);
  const values = { 'total-revenue': 10000, 'average-order-value': 1000, 'lead-response-rate': 40, 'prospect-response-rate': 20 };
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], {
    valueAsNumber: values[match[1]], value: '', validity: { valid: true }, validationMessage: 'Enter a valid value.',
    attributes: {}, listeners: {}, innerHTML: '', textContent: '', hidden: false,
    style: { setProperty(name, value) { this[name] = value; } },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    contains(element) { return element.graphRow === true; },
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
  }]));
  // SVG's .hidden is not an HTML reflected property. Test the attribute that
  // the stylesheet actually uses, instead of assuming an expando makes it visible.
  const svg = elements.get('campaign-chart-svg');
  delete svg.hidden;
  svg.setAttribute('hidden', '');
  elements.get('campaign-start').value = '2026-05-08';
  elements.get('campaign-end').value = '2026-11-04';
  const emit = (id, type, event = {}) => elements.get(id).listeners[type]?.forEach(handler => handler(event));
  load({ getElementById: id => elements.get(id) });
  return {
    get: id => elements.get(id), emit,
    change(id, value, valid = true, type = 'input') {
      const element = elements.get(id);
      if (id.startsWith('campaign-')) element.value = value;
      else element.valueAsNumber = value;
      element.validity.valid = valid;
      emit(id, type);
    },
  };
}

test('graph reacts to revenue, order value, both sliders and both calendars', () => {
  const { get, change } = setupPage();
  const svg = get('campaign-chart-svg');
  assert.equal(svg.hasAttribute('hidden'), false);
  assert.match(svg.innerHTML, /Prospects: 125/);
  for (const [id, value] of [
    ['total-revenue', 15000], ['average-order-value', 2000],
    ['lead-response-rate', 50], ['prospect-response-rate', 40],
    ['campaign-start', '2026-06-08'], ['campaign-end', '2026-08-10'],
  ]) {
    const previous = svg.innerHTML;
    change(id, value);
    assert.notEqual(svg.innerHTML, previous, `${id} must update the graph`);
    assert.equal(svg.hasAttribute('hidden'), false);
  }
  assert.match(svg.innerHTML, /Prospects: 37.5/);
  assert.equal(get('prospects-count').textContent, '37.5');
  assert.match(svg.innerHTML, /2026-06-08 to 2026-08-10/);
  change('campaign-end', '2026-07-08', true, 'change');
  assert.equal((svg.innerHTML.match(/data-chart-row=/g) || []).length, 1);
});

test('invalid dates or formula inputs hide stale charts and valid input restores them', () => {
  const { get, change } = setupPage();
  const svg = get('campaign-chart-svg');
  const status = get('campaign-chart-status');
  change('campaign-end', '2026-01-01');
  assert.equal(svg.hasAttribute('hidden'), true);
  assert.equal(svg.innerHTML, '');
  assert.match(status.textContent, /on or after/);
  assert.equal(get('campaign-end').attributes['aria-invalid'], 'true');
  assert.equal(get('prospects-count').textContent, '125');
  change('campaign-end', '2026-11-04');
  assert.equal(svg.hasAttribute('hidden'), false);
  assert.equal(status.hidden, true);
  assert.equal(get('campaign-end').attributes['aria-invalid'], 'false');
  change('prospect-response-rate', 0);
  assert.equal(svg.hasAttribute('hidden'), true);
  assert.match(status.textContent, /above 0%/);
  change('prospect-response-rate', 20);
  change('total-revenue', NaN, false);
  assert.equal(svg.hasAttribute('hidden'), true);
  change('total-revenue', 0);
  assert.equal(svg.hasAttribute('hidden'), false);
  assert.doesNotMatch(svg.innerHTML, /NaN|Infinity/);
  assert.match(svg.innerHTML, /Prospects: 0/);
});

test('SVG visibility uses the attribute and graph coordinates fit the available panel', () => {
  const { get, change } = setupPage();
  const plot = get('campaign-chart');
  const svg = get('campaign-chart-svg');
  assert.equal(svg.hidden, undefined, 'Do not assign an HTML-only property to SVG');
  assert.equal(svg.hasAttribute('hidden'), false);
  plot.clientWidth = 1200;
  plot.clientHeight = 600;
  change('total-revenue', 15000);
  assert.equal(svg.attributes.viewBox, '0 0 612 306');
  assert.match(svg.innerHTML, /class="chart-hit-area"[^>]*width="580"/);
  plot.clientWidth = 300;
  plot.clientHeight = 280;
  change('total-revenue', 10000);
  assert.equal(svg.attributes.viewBox, '0 0 328 306');
  assert.match(svg.innerHTML, /class="chart-hit-area"[^>]*width="296"/);
});

test('hover, focus and tap expose current row values; Escape and edits dismiss tooltips', () => {
  const { get, emit, change } = setupPage();
  const tooltip = get('campaign-chart-tooltip');
  const row = { graphRow: true, getAttribute() { return '5'; } };
  const event = { target: { closest() { return row; } } };
  for (const type of ['pointerover', 'focusin', 'click']) {
    emit('campaign-chart-svg', type, event);
    assert.equal(tooltip.hidden, false);
    assert.match(tooltip.textContent, /Month 6/);
    assert.match(tooltip.textContent, /Prospects: 125/);
    emit('campaign-chart-svg', 'keydown', { key: 'Escape' });
    assert.equal(tooltip.hidden, true);
  }
  emit('campaign-chart-svg', 'pointerover', event);
  change('total-revenue', 20000);
  assert.equal(tooltip.hidden, true);
  emit('campaign-chart-svg', 'focusin', event);
  assert.match(tooltip.textContent, /Prospects: 250/);
  emit('campaign-chart-svg', 'focusout');
  assert.equal(tooltip.hidden, true);
  emit('campaign-chart-svg', 'pointerover', event);
  emit('campaign-chart-svg', 'pointerleave');
  assert.equal(tooltip.hidden, true);
});
