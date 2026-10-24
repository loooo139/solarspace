/**
 * Read-only adapter for the public Solar Cloud API contracts observed in the
 * current AISWEI web-client bundles. Credentials stay in memory: callers must
 * provide a token explicitly; this module never reads browser storage.
 */
export type ApiEnvelope<T> = {
  code: number | string;
  result: T;
  message?: string;
};

export type DashboardResult = {
  statistics?: unknown;
  pacPercent?: {
    totalPower?: number | string;
    pac?: number | string;
    pacUnit?: string;
    percent?: number | string;
    [key: string]: unknown;
  };
  equHoursList?: unknown[];
  socialMap?: Record<string, unknown>;
  [key: string]: unknown;
};

export type PlantDeviceRecord = {
  byname?: string;
  isno?: string;
  psno?: string;
  e_today?: number | string;
  e_todayUnit?: string;
  hostType?: number | string;
  status?: number | string;
  imgurl?: string;
  plantId?: string;
  invList?: InverterDeviceRecord[];
  [key: string]: unknown;
};

export type InverterDeviceRecord = {
  isno?: string;
  byname?: string;
  psno?: string;
  status?: number | string;
  e_today?: number | string;
  e_todayUnit?: string;
  [key: string]: unknown;
};

export type PlantCard = {
  stationid?: string | number;
  stationname?: string;
  status?: number | string;
  bgurl?: string;
  etoday?: number | string;
  etodayUnit?: string;
  etotal?: number | string;
  etotalUnit?: string;
  totalpower?: number | string;
  [key: string]: unknown;
};

export type PlantListPage = {
  records: PlantDeviceRecord[];
  totalSize: number;
  [key: string]: unknown;
};

export type InverterPhaseReading = {
  /** MPPT channel for PV rows; phase/unit for AC or EPS rows. */
  mppt?: string | number;
  unit?: string;
  v?: number | string;
  i?: number | string;
  p?: number | string;
  [key: string]: unknown;
};

export type InverterStorageDetail = {
  code?: number | string;
  deviceList?: {
    data?: {
      pvList?: InverterPhaseReading[];
      acList?: InverterPhaseReading[];
      epsList?: InverterPhaseReading[];
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
};

export type InverterLiveDetail = {
  code?: number | string;
  deviceList?: {
    data?: {
      dailyProduction?: Record<string, unknown>;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
};

export type InverterHistoryMetric = {
  x?: Array<string | number>;
  y?: Array<Array<number | string | null>>;
  unit?: string;
  isno?: string;
  [key: string]: unknown;
};

export type ApiOptions = {
  /** Site origin serving the API. Defaults to the publicly observed China site. */
  baseUrl?: string;
  /** In-memory session token supplied by the desktop host. */
  token: string;
  /** Locale header value, for example `zh_CN`. */
  locale?: string;
  /** Injectable fetch implementation for desktop transport and tests. */
  fetchImpl?: typeof fetch;
};

export type PlantListParams = {
  current: number;
  pageSize: number;
  plantId?: string | number;
  level?: string;
};

export type TrendParams = { form: 1 | 2; dateStr: string };
export type ComparisonParams = { nowDate: string; lastDate: string };

/** Account-level production trend: `x` labels and `y` values share one unit. */
export type ProductionTrend = {
  x?: Array<string | number>;
  y?: Array<number | string | null>;
  unit?: string;
  [key: string]: unknown;
};

/** Per-inverter production bars; series are keyed by `list[].name` (ac/dc). */
export type InverterProduction = {
  x?: Array<string | number>;
  unit?: string;
  list?: Array<{ name?: string; value?: Array<number | string | null> }>;
  data?: {
    ac?: Array<number | string | null>;
    dc?: Array<number | string | null>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** One fault/alert entry from the plant error log. */
export type FaultRecord = {
  isno?: string;
  byname?: string;
  errCode?: number | string;
  context?: string;
  level?: number | string;
  occdt?: number;
  occdtTime?: string;
  tmstp?: number;
  imgurl?: string;
  [key: string]: unknown;
};

export type FaultList = {
  errorList?: FaultRecord[];
  count?: number;
  [key: string]: unknown;
};

export type QueryParams = Record<string, string | number | boolean | undefined>;
export class SolarApiError extends Error {
  readonly code: number | string;

  constructor(code: number | string, message: string) {
    super(message);
    this.name = "SolarApiError";
    this.code = code;
  }
}

export class SolarApi {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly locale: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiOptions) {
    this.baseUrl = (options.baseUrl ?? "https://www.aisweicloud.com").replace(
      /\/$/,
      "",
    );
    this.token = options.token;
    this.locale = options.locale ?? "zh_CN";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Dashboard summary; the caller supplies the local date as YYYY-MM-DD. */
  dashboard(today: string): Promise<DashboardResult> {
    return this.get<DashboardResult>("/api/plant/dashboard", { today });
  }

  /** @deprecated Use inverterGroups; retained as a safe compatibility alias. */
  plants(params: PlantListParams): Promise<PlantListPage> {
    return this.inverterGroups(params);
  }

  /** Paged inverter groups shown under a selected plant in Device Management. */
  inverterGroups(params: PlantListParams): Promise<PlantListPage> {
    return this.get<PlantListPage>("/api/plant/invList", params);
  }

  /** Plant cards use the same source service family with a distinct filter query. */
  plantCards(params: { own?: string | number; type?: string | number; name?: string; state?: string | number }): Promise<PlantCard[]> {
    return this.get<PlantCard[]>("/api/plant/plantList", params);
  }

  /** Plant summary details. The web client passes this endpoint a params object. */
  plantDetail(params: QueryParams): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      "/api/plant/detail/international",
      params,
    );
  }

  /** Plant energy-flow detail. Kept read-only and returns the source payload. */
  plantFlow(params: QueryParams): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      "/api/plant/plantDetailFlow",
      params,
    );
  }

  /** Production chart. Supported source periods are `month` and `year`. */
  production(
    period: "month" | "year",
    params: TrendParams,
  ): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `/api/chart/user/production/${period}`,
      params,
    );
  }

  /** Same-period comparison chart. Supported source periods are `month` and `year`. */
  comparison(
    period: "month" | "year",
    params: ComparisonParams,
  ): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `/api/chart/user/comparison/${period}`,
      params,
    );
  }

  /** Lifetime production trend (one bar per year) for the signed-in account. */
  productionTotal(form: 1 | 2): Promise<ProductionTrend> {
    return this.get<ProductionTrend>("/api/chart/user/production/total", { form, dateStr: "" });
  }

  /**
   * Per-inverter production bars. `month` returns one value per day (kWh),
   * `year` one value per month, `daily` one value per 10-minute slot.
   */
  inverterProduction(
    period: "daily" | "month" | "year" | "total",
    params: { isno: string; plantId: string | number; date: string },
  ): Promise<InverterProduction> {
    return this.get<InverterProduction>(
      `/api/chart/inverter/production/international/v3/${period}`,
      params,
    );
  }

  /** Active or historical plant fault/alert records. `start`/`end` are epoch ms. */
  faults(params: { id: string | number; scope: "current" | "history"; start: number; end: number; level: 1 | 2 | 3; sort?: 1 | 2 }): Promise<FaultList> {
    const { scope, ...query } = params;
    return this.get<FaultList>(`/api/plant/errlist/${scope}/v3`, query);
  }

  /** Inverter information lookup by the web client's `isno` identifier. */
  inverterBySerial(isno: string): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      "/api/inverter/findOneByisno",
      { isno },
    );
  }

  /** DC/AC/EPS phase rows for an inverter. Source nests rows under deviceList.data. */
  inverterStorageDetail(params: { isno: string; id: string | number }): Promise<InverterStorageDetail> {
    return this.getRoot<InverterStorageDetail>("/api/plant/storage/detail/v2", params);
  }

  /** Current-day inverter readings, including dailyProduction when available. */
  inverterDetail(isno: string): Promise<InverterLiveDetail> {
    return this.getRoot<InverterLiveDetail>("/api/equip/invdetail/v2", { isno });
  }

  /** Daily and lifetime DC/AC production. Date is YYYY-MM-DD. */
  inverterTotalEnergy(params: { isno: string; plantId: string | number; date: string }): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      "/api/chart/inverter/production/international/totalEnergy",
      params,
    );
  }

  /**
   * Historical inverter metrics for a selected day. `date` is epoch milliseconds.
   * The web client reads response.data keys vpv/ipv/vac/iac/pac/pdc/fac/temperature;
   * `soc` and `str` can also appear for AI logger devices. Each metric may contain
   * x, y (series arrays), unit and isno. Preserve the source payload for unknown keys.
   */
  inverterHistory(params: { isno: string; id: string | number; date: number }): Promise<{
    data?: Record<string, InverterHistoryMetric>;
    [key: string]: unknown;
  }> {
    return this.get("/api/chart/hyperbola", params);
  }

  private async get<T>(path: string, params: QueryParams): Promise<T> {
    const envelope = await this.request<ApiEnvelope<T>>(path, params);
    if (Number(envelope.code) !== 200) {
      throw new SolarApiError(
        envelope.code,
        envelope.message || "Solar Cloud returned an unsuccessful response",
      );
    }
    return envelope.result;
  }

  /** Some detail endpoints place `deviceList` beside `code`, not inside `result`. */
  private async getRoot<T extends { code?: number | string }>(path: string, params: QueryParams): Promise<T> {
    const envelope = await this.request<T & ApiEnvelope<unknown>>(path, params);
    if (Number(envelope.code) !== 200) {
      throw new SolarApiError(
        envelope.code,
        envelope.message || "Solar Cloud returned an unsuccessful response",
      );
    }
    return envelope;
  }

  private async request<T>(path: string, params: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await this.fetchImpl(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: this.token,
        localE: this.locale,
      },
    });
    if (!response.ok) {
      throw new SolarApiError(response.status, `Solar Cloud request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }
}
