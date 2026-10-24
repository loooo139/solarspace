export type IdRecord = Record<string, unknown>;

const PLANT_ID_FIELDS = ["stationid", "stationId", "plantId", "plantid", "psId", "psid", "plant_id"] as const;

function record(value: unknown): IdRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as IdRecord
    : undefined;
}

function identifier(value: unknown): string | undefined {
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return undefined;
  const normalized = String(value).trim();
  return normalized.length ? normalized : undefined;
}

function plantIdFrom(value: unknown): string | undefined {
  const source = record(value);
  if (!source) return undefined;
  for (const key of PLANT_ID_FIELDS) {
    const id = identifier(source[key]);
    if (id) return id;
  }
  return undefined;
}

/** Resolve only station/plant-specific fields; generic `id` may identify a device. */
export function resolvePlantId(device: unknown, selectedPlant?: unknown): string | undefined {
  const deviceRecord = record(device);
  const deviceGroup = record(deviceRecord?.deviceGroup);
  return plantIdFrom(deviceRecord)
    ?? plantIdFrom(deviceGroup)
    ?? plantIdFrom(selectedPlant);
}

/** Preserve each source record while carrying its station ID to device actions. */
export function withDevicePlantContext(device: IdRecord, group: IdRecord, selectedPlant?: unknown): IdRecord {
  const plantId = resolvePlantId(device, selectedPlant ?? group);
  return {
    ...device,
    ...(plantId ? { plantId } : {}),
    deviceGroup: group,
  };
}

export const MISSING_PLANT_ID_MESSAGE = "找不到关联电站编号，已跳过直流、交流和历史数据查询。请从电站详情中选择设备，或刷新设备列表后重试。";

export function inverterPlantRequest(device: unknown, selectedPlant?: unknown):
  | { id: string; error?: undefined }
  | { id?: undefined; error: string } {
  const id = resolvePlantId(device, selectedPlant);
  return id ? { id } : { error: MISSING_PLANT_ID_MESSAGE };
}
