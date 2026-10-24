const PLANT_FIELDS = Object.freeze([
  "id",
  "name",
  "location",
  "capacity",
  "today",
  "total",
  "status",
  "efficiency",
  "devices",
]);

function csvCell(value) {
  let text = String(value ?? "");
  // Spreadsheet applications may evaluate cells beginning with these characters.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(records) {
  if (!Array.isArray(records) || records.length > 10000) {
    throw new TypeError("Expected a list of at most 10,000 plant records");
  }
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("Each plant record must be an object");
    }
    for (const key of PLANT_FIELDS) {
      const value = record[key];
      if (value !== undefined && value !== null && !["string", "number", "boolean"].includes(typeof value)) {
        throw new TypeError(`Invalid value for ${key}`);
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new TypeError(`Invalid number for ${key}`);
      }
    }
  }
  return [
    PLANT_FIELDS.map(csvCell).join(","),
    ...records.map((record) => PLANT_FIELDS.map((field) => csvCell(record[field])).join(",")),
  ].join("\r\n");
}

module.exports = { PLANT_FIELDS, csvCell, toCsv };
