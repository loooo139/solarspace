# Read-only Solar Cloud API contract notes

Research date: 2026-10-24. The initial contract research used publicly served JavaScript plus an unauthenticated GET check. Subsequent validation used the authored desktop client after the user personally signed in: overview, inverter inventories, DC/AC readings, daily energy and historical series were visibly returned in the local app. No credentials were requested from the user, no existing Chrome session was copied, and no write/remote-control call was exercised. Service access requires an authorized, valid user session; a token alone is insufficient.

## Transport and authentication observed

- The webpack runtime uses relative paths (`U.p = "/"`); the default public UI origin is `https://www.aisweicloud.com`. Regional/tenant variants may use a different origin.
- The shared request interceptor sets `credentials: "include"`, `Accept: application/json`, `Content-Type: application/json`, `localE` (locale with `-` replaced by `_`), and, when present, `token` from web local storage.
- Login code posts `{account,password}` to `/api/user/login`; after a successful login it stores `data.token`, stores an `apitoken` cookie, and stores `ipaddr` and account display data. The app adapter accepts an in-memory token and uses credentialed GETs. Electron must use the user's normal authenticated session/cookie flow; it must not scrape browser storage or assume the token header by itself works.
- A separate unauthenticated GET to `/api/plant/dashboard?today=2026-10-24` returned `JWT required header:cookie missing`. Therefore all integrations must handle auth/session failure explicitly and offer a normal sign-in path.
- Some APIs return `{code,result}`, while the inverter detail APIs used below expose `{code,deviceList}` at the root. The adapter preserves those endpoint-specific envelopes.

## Read-only calls

| UI purpose | Method and path | Query | Source-visible result shape |
| --- | --- | --- | --- |
| Overview summary | GET `/api/plant/dashboard` | `today=YYYY-MM-DD` | `result.statistics`, `result.pacPercent` (`totalPower`, `pac`, `pacUnit`, `percent`), `result.equHoursList`, `result.socialMap` |
| Plant cards | GET `/api/plant/plantList` | optional filters `{own,type,name,state}`; defaults in the form are `own=1`, `type=1` | `result` is an array of plant records. The card renders `stationid`, `stationname`, `status`, `bgurl`, `etoday`, `etodayUnit`, `etotal`, `etotalUnit`, `totalpower`. Type filter values 1=Plant, 2=Dongle, 3=Inverter; ownership values 1=All, 2=Shared, 3=Owned, 4=Empty. |
| Device/inverter groups | GET `/api/plant/invList` | paged caller sends `current`, `pageSize`, optional `plantId`, `level` | `result.records`, `result.totalSize`; record groups contain `psno`, `invList`; rendered inverter keys include `imgurl`, `status`, `byname`, `isno`, `psno`, `hostType`, `e_today`, `e_todayUnit`. |
| Plant detail | GET `/api/plant/detail/international` | `{id: stationid}` | `result` consumed by the plant detail page; fields include `detail`, `dailyProduction`, `permissions` and other summary groups. |
| Plant flow / daily plant chart | GET `/api/plant/plantDetailFlow` | `{isno,id,date}` was seen for inverter day charts; plant-page caller passes a params object | `result.data` is chart data in the inverter caller; plant-specific shape not fully confirmed |
| Inverter metadata | GET `/api/inverter/findOneByisno` | `{isno}` | `result.isAiLogger` controls optional history metrics; the detail UI also uses inverter identity metadata |
| Inverter DC/AC/EPS rows | GET `/api/plant/storage/detail/v2` | `{isno,id}` (`id` is plant id) | Root `deviceList.data.pvList`, `acList`, `epsList`; PV rows use `mppt`, `v`, `i`, `p`; AC/EPS rows use `unit`, `v`, `i`, `p` |
| Inverter daily readings | GET `/api/equip/invdetail/v2` | `{isno}` | Root `deviceList.data.dailyProduction`; source uses daily `dc`/`ac` and total `dc`/`ac`/`hotal`/unit values in the detail page |
| Inverter DC/AC total energy | GET `/api/chart/inverter/production/international/totalEnergy` | `{isno,plantId,date}` (`date` is `YYYY-MM-DD`) | `result` is rendered as `dc`, `ac`, `unit`, `hotal`, `hotalUnit` |
| Fault / alert records | GET `/api/plant/errlist/{current\|history}/v3` | `id` plant id, `start`/`end` epoch ms (`current` uses `start=end=now`), `level` 1/2/3, `sort` 1/2 | `result.data.errorList[]` with `occdtTime`, `occdt`, `errCode`, `context`, `level`, `byname`, `isno`; `current` returns only active faults, `history` the full log with `count`. |
| Plant profile fields | GET `/api/plant/detail/international?id=` | — | `result.detail` additionally exposes `savings.{daily,total,co2,money}`, `buyxs`/`gainxs` tariffs, `startdt`, `createdt`, `ePower` (W), `eToday`/`eTotal` (kWh), `totalpower`, `pmuNum`, `warnNum`/`errNum`, coordinates, timezone; `result.weather` exposes `text`, `tmp`, `windSpd`, `sunrise`, `sunset`. |
| Device rollup fields | GET `/api/plant/invList` | — | each `records[].invList[]` entry also carries `e_today`, `emonth`, `etotal` with units, `pac`/`pac_u`, `softver`, `ludt`, `state`/`status` — enough for a per-device table without extra calls. |
| Account production trend | GET `/api/chart/user/production/{month\|year\|total}` | `form` 1 power / 2 income, `dateStr` `YYYY-MM` / `YYYY` / empty for total | `result.x`, `result.y`, `result.unit`; month = one bar per day, year = one per month, total = one per year. Verified in the signed-in web client on 2026-10-24 (`unit` kWh / MWh / ￥). |
| Inverter production bars | GET `/api/chart/inverter/production/international/v3/{daily\|month\|year}` | `isno`, `plantId` (the inverter's own plant), `date` `YYYY-MM-DD` / `YYYY-MM` / `YYYY` | `result.x`, `result.unit`, `result.list[]` with `{name: "ac"\|"dc", value: []}`; month = per day, year = per month, daily = 144 ten-minute slots. |
| Plant production bars | GET `/api/chart/production/international/{daily\|month\|year\|total}` | `plantId`, `isno` (empty for plant), `date` | `result.x`, `result.unit`, `result.data.ac/dc`. |
| Inverter history series | GET `/api/chart/hyperbola` | `{isno,id,date}` (`date` is epoch milliseconds for selected day) | `result.data` keyed by metrics; each metric can expose `{x,y,unit,isno}`, with `y` as series arrays. Metric ids: `vpv`, `ipv`, `vac`, `iac`, `pac`, `pdc`, `fac`, `temperature`; `soc` and `str` may be offered for AI logger hardware. |
| User production trend | GET `/api/chart/user/production/{month|year}` | `{form,dateStr}`; `form` 1 power, 2 income | `result` consumed by chart; precise field map not fully traced |
| User comparison trend | GET `/api/chart/user/comparison/{month|year}` | `{nowDate,lastDate}` | `result` consumed by comparison chart; precise field map not fully traced |

Endpoint and parameter evidence is in the public bundles `work/overview.async.js`, `work/inverter.pretty.js`, and `work/chunks/4141-4141.js`, together with login code in `work/login.js`. The adapter implementing only the necessary read methods is `outputs/solar-prototype/src/live.ts`; it does not read local storage and does not implement write operations.

## Explicitly excluded

The service inquiry component (public chunk `5984-p__Service__Inquiry__index.js`) directly calls GET `/api/service/fault/getCsWarrantyInfoes` with `{isno}`. Confirmed response fields are `result.isn`, `std_warrantyyear`, `ext_warrantyyear`, `std_warranty_date`, and `ext_warranty_date`. The desktop bridge exposes only the fixed `warranty` operation; it does not submit claims or change warranty records.

Final field checks from the public overview and plant-card components: dashboard root `all` / `online` are station counts; `statistics.etoday` / `etodayUnit`, `emonth` / `emonthUnit`, and `etotal` / `etotalUnit` are energy values. `pacPercent.pac` / `pacUnit` is current power and `pacPercent.totalPower` is installed capacity in kWp. Plant-card `totalpower` is installed capacity in kWp; `power` / `powerUnit` is current power. These are distinct values and must not be interchanged.

The source bundles contain write and remote-control services, including inverter alias changes, device deletion, recalculation, and `/api/tbremotecmd/remote/...`. They are intentionally excluded from the client adapter. Do not add remote operations to the UI or call them as part of QA. Unknown response fields should remain opaque rather than be guessed into user-visible live values.
