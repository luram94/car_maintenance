// JSON validators for the maintenance data and plan. Pure: no DOM, no state.
// Returns { ok: boolean, errors: string[], warnings: string[] }.

const VALID_CATEGORIES = ["routine", "wear", "major", "repair"];

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function isPosNum(v) {
  return isFiniteNum(v) && v >= 0;
}
function isISODate(v) {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, mo - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === mo - 1 &&
    date.getDate() === d
  );
}

export function validateData(d) {
  const errors = [];
  const warnings = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    errors.push("Data root must be an object.");
    return { ok: false, errors, warnings };
  }
  if (d.schemaVersion !== 1) {
    errors.push(`Unsupported schemaVersion: ${JSON.stringify(d.schemaVersion)} (expected 1).`);
  }

  if (!d.car || typeof d.car !== "object" || Array.isArray(d.car)) {
    errors.push("car block missing or not an object.");
  } else {
    const required = ["make", "model", "engine", "year", "powerCv", "body", "version", "vin"];
    for (const k of required) {
      if (!(k in d.car)) errors.push(`car.${k} missing.`);
    }
    if (d.car.year != null && (!isFiniteNum(d.car.year) || d.car.year < 1900 || d.car.year > 2100)) {
      errors.push(`car.year invalid: ${JSON.stringify(d.car.year)}.`);
    }
    if (d.car.powerCv != null && !isPosNum(d.car.powerCv)) {
      errors.push(`car.powerCv must be a non-negative number.`);
    }
    if (d.car.vin != null && typeof d.car.vin !== "string") {
      errors.push(`car.vin must be a string.`);
    }
  }

  if (!d.currentMileage || typeof d.currentMileage !== "object") {
    errors.push("currentMileage block missing.");
  } else {
    if (!isPosNum(d.currentMileage.km)) {
      errors.push("currentMileage.km must be a non-negative number.");
    }
    if (d.currentMileage.updatedAt != null && !isISODate(d.currentMileage.updatedAt)) {
      errors.push("currentMileage.updatedAt must be YYYY-MM-DD or null.");
    }
  }

  if (!Array.isArray(d.interventions)) {
    errors.push("interventions must be an array.");
  } else {
    const seen = new Set();
    for (const [i, iv] of d.interventions.entries()) {
      if (!iv || typeof iv !== "object") {
        errors.push(`interventions[${i}] must be an object.`);
        continue;
      }
      if (!iv.id) errors.push(`interventions[${i}].id missing.`);
      else if (seen.has(iv.id)) errors.push(`Duplicate intervention id: ${iv.id}.`);
      else seen.add(iv.id);
      if (iv.date != null && !isISODate(iv.date)) {
        errors.push(`interventions[${i}].date must be YYYY-MM-DD or null (got ${JSON.stringify(iv.date)}).`);
      }
      if (iv.km != null && !isPosNum(iv.km)) {
        errors.push(`interventions[${i}].km invalid.`);
      }
      if (iv.totalCost != null && !isPosNum(iv.totalCost)) {
        errors.push(`interventions[${i}].totalCost invalid.`);
      }
    }
  }

  if (!Array.isArray(d.maintenanceRecords)) {
    errors.push("maintenanceRecords must be an array.");
  } else {
    const seen = new Set();
    const intIds = new Set((Array.isArray(d.interventions) ? d.interventions : []).map((i) => i.id));
    for (const [i, r] of d.maintenanceRecords.entries()) {
      if (!r || typeof r !== "object") {
        errors.push(`maintenanceRecords[${i}] must be an object.`);
        continue;
      }
      if (!r.id) errors.push(`maintenanceRecords[${i}].id missing.`);
      else if (seen.has(r.id)) errors.push(`Duplicate record id: ${r.id}.`);
      else seen.add(r.id);
      if (!r.type) errors.push(`maintenanceRecords[${i}].type missing.`);
      if (r.date != null && !isISODate(r.date)) {
        errors.push(`maintenanceRecords[${i}].date must be YYYY-MM-DD or null.`);
      }
      if (r.km != null && !isPosNum(r.km)) {
        errors.push(`maintenanceRecords[${i}].km invalid.`);
      }
      if (r.cost != null && !isPosNum(r.cost)) {
        errors.push(`maintenanceRecords[${i}].cost invalid.`);
      }
      if (r.quantity != null && !isPosNum(r.quantity)) {
        errors.push(`maintenanceRecords[${i}].quantity invalid.`);
      }
      if (r.interventionId && !intIds.has(r.interventionId)) {
        warnings.push(`maintenanceRecords[${i}] references unknown intervention "${r.interventionId}".`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validatePlan(p) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(p)) {
    errors.push("Plan must be an array.");
    return { ok: false, errors, warnings };
  }
  const seen = new Set();
  for (const [i, item] of p.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`plan[${i}] must be an object.`);
      continue;
    }
    if (!item.id) errors.push(`plan[${i}].id missing.`);
    else if (seen.has(item.id)) errors.push(`Duplicate plan id: ${item.id}.`);
    else seen.add(item.id);
    if (!item.name) errors.push(`plan[${i}].name missing.`);
    if (!VALID_CATEGORIES.includes(item.category)) {
      errors.push(`plan[${i}].category must be one of ${VALID_CATEGORIES.join("/")} (got ${JSON.stringify(item.category)}).`);
    }
    if (item.intervalKm != null && !isPosNum(item.intervalKm)) {
      errors.push(`plan[${i}].intervalKm must be a non-negative number or null.`);
    }
    if (item.intervalMonths != null && !isPosNum(item.intervalMonths)) {
      errors.push(`plan[${i}].intervalMonths must be a non-negative number or null.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// Records whose type isn't in the plan are allowed but flagged as a warning
// so the user can clean up (e.g. after a plan delete).
export function crossValidate(data, plan) {
  const warnings = [];
  const planIds = new Set((plan || []).map((p) => p.id));
  const seen = new Set();
  for (const r of data.maintenanceRecords || []) {
    if (r.type && !planIds.has(r.type) && !seen.has(r.type)) {
      warnings.push(`Maintenance type "${r.type}" is not in the plan.`);
      seen.add(r.type);
    }
  }
  return warnings;
}

export const __testables = { isISODate, isPosNum, VALID_CATEGORIES };
