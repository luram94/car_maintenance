// Maintenance calculation engine. Pure: no DOM, no state imports.

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

export function parseISODate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + Math.round(months));
  return d;
}

export function monthsBetween(from, to) {
  return (to.getTime() - from.getTime()) / MS_PER_MONTH;
}

export function formatLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatKm(n) {
  return `${Math.round(n).toLocaleString("en-US")} km`;
}

// Honest date label: prefer dateText, never display an approximate ISO as exact.
export function formatRecordDate(rec) {
  if (rec.dateText) return rec.dateText;
  if (rec.date && !rec.dateApproximate) return rec.date;
  if (rec.date && rec.dateApproximate) return `${rec.date} approximate`;
  return "date unknown";
}

export function findLatestRecord(records, type) {
  const matching = records.filter((r) => r.type === type);
  if (!matching.length) return null;
  matching.sort((a, b) => {
    const akm = a.km == null ? -Infinity : a.km;
    const bkm = b.km == null ? -Infinity : b.km;
    if (bkm !== akm) return bkm - akm;
    const ad = parseISODate(a.date)?.getTime() ?? -Infinity;
    const bd = parseISODate(b.date)?.getTime() ?? -Infinity;
    return bd - ad;
  });
  return matching[0];
}

// km/month average from points with non-approximate dates + dated currentMileage.
// Returns null if fewer than 2 usable points or non-positive slope.
export function estimateKmPerMonth(data) {
  const points = [];
  for (const r of data.maintenanceRecords) {
    if (r.km != null && r.date && r.dateApproximate === false) {
      const d = parseISODate(r.date);
      if (d) points.push({ km: r.km, date: d });
    }
  }
  const cm = data.currentMileage;
  if (cm && cm.km != null && cm.updatedAt) {
    const d = parseISODate(cm.updatedAt);
    if (d) points.push({ km: cm.km, date: d });
  }
  if (points.length < 2) return null;
  points.sort((a, b) => a.date - b.date);
  const first = points[0];
  const last = points[points.length - 1];
  const months = monthsBetween(first.date, last.date);
  if (months <= 0) return null;
  const rate = (last.km - first.km) / months;
  return rate > 0 ? rate : null;
}

export function computeUrgency(remainingKm, remainingMonths) {
  if (remainingKm != null && remainingKm < 1000) return "red";
  if (remainingMonths != null && remainingMonths < 1) return "red";
  if (remainingKm != null && remainingKm < 5000) return "yellow";
  if (remainingMonths != null && remainingMonths < 3) return "yellow";
  if (remainingKm != null || remainingMonths != null) return "green";
  return "neutral";
}

export function computeRow(item, data, currentKm, kmPerMonth, now) {
  const lastRecord = findLatestRecord(data.maintenanceRecords, item.id);
  const isRepair = item.category === "repair";
  const noSchedule = item.intervalKm == null && item.intervalMonths == null;

  if (isRepair || noSchedule) {
    return {
      item,
      lastRecord,
      kind: isRepair ? "repair" : "no-schedule",
      urgency: "neutral",
    };
  }

  if (!lastRecord) {
    return { item, lastRecord: null, kind: "no-history", urgency: "neutral" };
  }

  let nextKm = null;
  let remainingKm = null;
  if (item.intervalKm != null && lastRecord.km != null) {
    nextKm = lastRecord.km + item.intervalKm;
    remainingKm = nextKm - currentKm;
  }

  let nextDate = null;
  let nextDateApproximate = false;
  let remainingMonths = null;
  if (item.intervalMonths != null) {
    const base = parseISODate(lastRecord.date);
    if (base) {
      nextDate = addMonths(base, item.intervalMonths);
      nextDateApproximate = lastRecord.dateApproximate === true;
      remainingMonths = monthsBetween(now, nextDate);
    }
  }

  let estimatedDate = null;
  if (
    nextDate == null &&
    remainingKm != null &&
    kmPerMonth != null &&
    kmPerMonth > 0
  ) {
    estimatedDate = addMonths(now, remainingKm / kmPerMonth);
  }

  const urgency = computeUrgency(remainingKm, remainingMonths);

  return {
    item,
    lastRecord,
    kind: "scheduled",
    nextKm,
    remainingKm,
    nextDate,
    nextDateApproximate,
    remainingMonths,
    estimatedDate,
    urgency,
  };
}

export function computePlanRows(data, plan, now = new Date()) {
  const currentKm = data.currentMileage?.km ?? 0;
  const kmPerMonth = estimateKmPerMonth(data);
  return plan.map((item) => computeRow(item, data, currentKm, kmPerMonth, now));
}

// Order per spec: red → yellow → no-history → green → repair/no-schedule.
export function tierOf(row) {
  if (row.urgency === "red") return 0;
  if (row.urgency === "yellow") return 1;
  if (row.kind === "no-history") return 2;
  if (row.urgency === "green") return 3;
  return 4;
}

export function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const t = tierOf(a) - tierOf(b);
    if (t !== 0) return t;
    const ak = a.remainingKm == null ? Infinity : a.remainingKm;
    const bk = b.remainingKm == null ? Infinity : b.remainingKm;
    if (ak !== bk) return ak - bk;
    const am = a.remainingMonths == null ? Infinity : a.remainingMonths;
    const bm = b.remainingMonths == null ? Infinity : b.remainingMonths;
    return am - bm;
  });
}

// Cost summary, counting each intervention's totalCost once and adding only
// standalone records' costs. Nulls are excluded from totals and reported
// separately as "unknown".
export function computeCostSummary(data) {
  let intervTotal = 0;
  let intervKnownCount = 0;
  for (const iv of data.interventions || []) {
    if (iv.totalCost != null && Number.isFinite(iv.totalCost)) {
      intervTotal += iv.totalCost;
      intervKnownCount++;
    }
  }
  let standaloneTotal = 0;
  let standaloneKnownCount = 0;
  let standaloneCount = 0;
  for (const r of data.maintenanceRecords || []) {
    if (!r.interventionId) {
      standaloneCount++;
      if (r.cost != null && Number.isFinite(r.cost)) {
        standaloneTotal += r.cost;
        standaloneKnownCount++;
      }
    }
  }
  const intervCount = (data.interventions || []).length;
  const total = intervTotal + standaloneTotal;

  // Average annual: derive from earliest known dated record/intervention to
  // currentMileage.updatedAt (or today). Only useful with > ~1 year of span.
  const datedPoints = [];
  for (const iv of data.interventions || []) {
    if (iv.totalCost != null) {
      const d = parseISODate(iv.date);
      if (d) datedPoints.push(d);
    }
  }
  for (const r of data.maintenanceRecords || []) {
    if (r.cost != null && !r.interventionId) {
      const d = parseISODate(r.date);
      if (d) datedPoints.push(d);
    }
  }
  let avgAnnual = null;
  let kmRange = null;
  let costPerKm = null;
  if (datedPoints.length >= 1) {
    datedPoints.sort((a, b) => a - b);
    const earliest = datedPoints[0];
    const nowD =
      parseISODate(data.currentMileage?.updatedAt) || new Date();
    const months = Math.max(0, monthsBetween(earliest, nowD));
    const years = months / 12;
    if (years >= 0.25 && total > 0) {
      avgAnnual = total / years;
    }
  }

  // €/km: from earliest known km point with a cost to current km.
  const kmPoints = [];
  for (const iv of data.interventions || []) {
    if (iv.totalCost != null && iv.km != null) kmPoints.push(iv.km);
  }
  for (const r of data.maintenanceRecords || []) {
    if (r.cost != null && r.km != null && !r.interventionId) {
      kmPoints.push(r.km);
    }
  }
  if (kmPoints.length >= 1 && data.currentMileage?.km != null) {
    const minKm = Math.min(...kmPoints);
    const span = data.currentMileage.km - minKm;
    if (span > 0 && total > 0) {
      kmRange = span;
      costPerKm = total / span;
    }
  }

  return {
    total,
    intervTotal,
    intervCount,
    intervKnownCount,
    standaloneTotal,
    standaloneCount,
    standaloneKnownCount,
    avgAnnual,
    kmRange,
    costPerKm,
  };
}
