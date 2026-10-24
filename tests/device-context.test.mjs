import test from 'node:test';
import assert from 'node:assert/strict';
import { inverterPlantRequest, resolvePlantId, withDevicePlantContext, MISSING_PLANT_ID_MESSAGE } from '../src/device-context.ts';

test('inverter requests use the station id, never a conflicting device id', () => {
  const device = { id: 'DEVICE-9', isno: 'SN-9', deviceGroup: { stationid: 'PLANT-4' } };
  assert.equal(resolvePlantId(device), 'PLANT-4');
  assert.deepEqual(inverterPlantRequest(device), { id: 'PLANT-4' });
  assert.notEqual(inverterPlantRequest(device).id, device.id);
});

test('an explicit device plant id wins over a stale currently selected plant', () => {
  const device = { id: 'DEVICE-9', plantId: 'PLANT-B', isno: 'SN-9' };
  assert.deepEqual(inverterPlantRequest(device, { stationid: 'PLANT-A' }), { id: 'PLANT-B' });
});

test('flattened device context carries the group station id onto each device', () => {
  const group = { stationid: 4, psno: 'LOGGER-1', invList: [{ id: 9, isno: 'SN-9' }] };
  const device = withDevicePlantContext(group.invList[0], group);
  assert.equal(device.id, 9);
  assert.equal(device.plantId, '4');
  assert.equal(inverterPlantRequest(device).id, '4');
});

test('a device without a station id yields a clear error and no request id', () => {
  const result = inverterPlantRequest({ id: 'DEVICE-9', deviceId: 'DEVICE-10', isno: 'SN-9' });
  assert.equal(result.id, undefined);
  assert.equal(result.error, MISSING_PLANT_ID_MESSAGE);
});
