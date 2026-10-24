import test from 'node:test';
import assert from 'node:assert/strict';
import { SolarApi, SolarApiError } from '../src/live.ts';

function response(result, code = 200) {
  return { ok: true, status: 200, json: async () => ({ code, result }) };
}

function rawResponse(fields, code = 200) {
  return { ok: true, status: 200, json: async () => ({ code, ...fields }) };
}

test('dashboard uses the observed read-only path, date query, and token header', async () => {
  let request;
  const api = new SolarApi({
    token: 'memory-token',
    fetchImpl: async (url, init) => {
      request = { url: new URL(url), init };
      return response({ statistics: { sample: true } });
    },
  });
  const result = await api.dashboard('2026-10-24');
  assert.deepEqual(result, { statistics: { sample: true } });
  assert.equal(request.url.origin, 'https://www.aisweicloud.com');
  assert.equal(request.url.pathname, '/api/plant/dashboard');
  assert.equal(request.url.searchParams.get('today'), '2026-10-24');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.credentials, 'include');
  assert.equal(request.init.headers.token, 'memory-token');
  assert.equal(request.init.headers.localE, 'zh_CN');
});

test('inverter group pagination uses the actual Device Management endpoint', async () => {
  let requestedUrl;
  const api = new SolarApi({
    baseUrl: 'https://solar.example.test/',
    token: 'session',
    locale: 'en_US',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return response({ records: [{ psno: 'LOGGER-1', invList: [{ isno: 'INV-1' }] }], totalSize: 1 });
    },
  });
  const page = await api.inverterGroups({ current: 2, pageSize: 10, plantId: 'PL-7', level: 'north' });
  assert.equal(page.totalSize, 1);
  assert.equal(page.records[0].psno, 'LOGGER-1');
  assert.equal(page.records[0].invList[0].isno, 'INV-1');
  assert.equal(requestedUrl.origin, 'https://solar.example.test');
  assert.equal(requestedUrl.pathname, '/api/plant/invList');
  assert.deepEqual(Object.fromEntries(requestedUrl.searchParams), {
    current: '2', pageSize: '10', plantId: 'PL-7', level: 'north',
  });
});

test('plant cards use the distinct plant-list filter contract', async () => {
  let requestedUrl;
  const api = new SolarApi({ token: 'session', fetchImpl: async (url) => {
    requestedUrl = new URL(url);
    return response([{ stationid: 'PL-7', stationname: 'North roof' }]);
  } });
  const cards = await api.plantCards({ own: 1, type: 1, name: 'North', state: 0 });
  assert.equal(cards[0].stationid, 'PL-7');
  assert.equal(requestedUrl.pathname, '/api/plant/plantList');
  assert.deepEqual(Object.fromEntries(requestedUrl.searchParams), { own: '1', type: '1', name: 'North', state: '0' });
});

test('trend and inverter methods remain GET-only and preserve source parameters', async () => {
  const requests = [];
  const api = new SolarApi({ token: 'session', fetchImpl: async (url, init) => {
    requests.push({ url: new URL(url), init });
    return response({ x: [], y: [] });
  } });
  await api.production('month', { form: 1, dateStr: '2026-10' });
  await api.comparison('year', { nowDate: '2026', lastDate: '2025' });
  await api.inverterBySerial('INV 1');
  await api.productionTotal(2);
  await api.inverterProduction('month', { isno: 'INV 1', plantId: 'PL-9', date: '2026-10' });
  await api.faults({ id: 'PL-9', scope: 'history', start: 0, end: 1792800000000, level: 3 });
  assert.equal(requests[0].url.pathname, '/api/chart/user/production/month');
  assert.equal(requests[0].url.searchParams.get('form'), '1');
  assert.equal(requests[0].url.searchParams.get('dateStr'), '2026-10');
  assert.equal(requests[1].url.pathname, '/api/chart/user/comparison/year');
  assert.equal(requests[1].url.searchParams.get('lastDate'), '2025');
  assert.equal(requests[2].url.pathname, '/api/inverter/findOneByisno');
  assert.equal(requests[2].url.searchParams.get('isno'), 'INV 1');
  assert.equal(requests[3].url.pathname, '/api/chart/user/production/total');
  assert.equal(requests[3].url.searchParams.get('form'), '2');
  assert.equal(requests[3].url.searchParams.get('dateStr'), '');
  assert.equal(requests[4].url.pathname, '/api/chart/inverter/production/international/v3/month');
  assert.equal(requests[4].url.searchParams.get('plantId'), 'PL-9');
  assert.equal(requests[5].url.pathname, '/api/plant/errlist/history/v3');
  assert.equal(requests[5].url.searchParams.get('level'), '3');
  assert.equal(requests[5].url.searchParams.get('scope'), null);
  assert.ok(requests.every(({ init }) => init.method === 'GET'));
});

test('inverter detail, total energy, and history use verified read-only contracts', async () => {
  const requests = [];
  const api = new SolarApi({ token: 'session', fetchImpl: async (url, init) => {
    requests.push({ url: new URL(url), init });
    if (new URL(url).pathname.endsWith('/storage/detail/v2')) {
      return rawResponse({ deviceList: { data: { pvList: [{ mppt: 'MPPT1', v: 612, i: 5.2, p: 3182 }] } } });
    }
    if (new URL(url).pathname.endsWith('/invdetail/v2')) {
      return rawResponse({ deviceList: { data: { dailyProduction: { dc: 12, ac: 11 } } } });
    }
    return response({ deviceList: { data: { pvList: [{ mppt: 'MPPT1', v: 612, i: 5.2, p: 3182 }] } }, data: { vpv: { x: ['10:00'], y: [[612]], unit: 'V', isno: 'INV-1' } } });
  } });

  const detail = await api.inverterStorageDetail({ isno: 'INV-1', id: 'PL-1' });
  assert.equal(detail.deviceList.data.pvList[0].mppt, 'MPPT1');
  assert.deepEqual((await api.inverterDetail('INV-1')).deviceList.data.dailyProduction, { dc: 12, ac: 11 });
  await api.inverterTotalEnergy({ isno: 'INV-1', plantId: 'PL-1', date: '2026-10-24' });
  const history = await api.inverterHistory({ isno: 'INV-1', id: 'PL-1', date: 1792800000000 });

  assert.equal(requests[0].url.pathname, '/api/plant/storage/detail/v2');
  assert.deepEqual(Object.fromEntries(requests[0].url.searchParams), { isno: 'INV-1', id: 'PL-1' });
  assert.equal(requests[1].url.pathname, '/api/equip/invdetail/v2');
  assert.equal(requests[1].url.searchParams.get('isno'), 'INV-1');
  assert.equal(requests[2].url.pathname, '/api/chart/inverter/production/international/totalEnergy');
  assert.equal(requests[2].url.searchParams.get('date'), '2026-10-24');
  assert.equal(requests[3].url.pathname, '/api/chart/hyperbola');
  assert.equal(requests[3].url.searchParams.get('date'), '1792800000000');
  assert.equal(history.data.vpv.unit, 'V');
  assert.ok(requests.every(({ init }) => init.method === 'GET'));
});

test('HTTP and API envelope failures surface as SolarApiError', async () => {
  const unavailable = new SolarApi({ token: 'x', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => unavailable.dashboard('2026-10-24'), SolarApiError);
  const rejected = new SolarApi({ token: 'x', fetchImpl: async () => response(null, 401) });
  await assert.rejects(() => rejected.dashboard('2026-10-24'), (error) => error.code === 401);
});
