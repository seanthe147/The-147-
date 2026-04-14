/**
 * UK Employment Law — Leave Calculation Utilities
 * Working Time Regulations 1998 / Employment Rights Act 1996
 * Applies to England and Wales public holidays.
 */

// ── Easter calculation (Gaussian algorithm) ───────────────────────────────────

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Move a holiday that falls on Saturday to Monday, Sunday to Monday (standard UK substitute). */
function substituteWeekend(d: Date): Date {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 6) return addDays(d, 2); // Sat → Mon
  if (dow === 0) return addDays(d, 1); // Sun → Mon
  return d;
}

/**
 * Returns a sorted list of England & Wales public holiday dates (YYYY-MM-DD)
 * for the given year, applying weekend substitute rules.
 */
export function getEnglandWalesBankHolidays(year: number): string[] {
  const holidays: Date[] = [];

  // 1. New Year's Day — 1 Jan (sub if weekend)
  holidays.push(substituteWeekend(new Date(Date.UTC(year, 0, 1))));

  // 2. Good Friday — Easter - 2
  const easter = easterSunday(year);
  holidays.push(addDays(easter, -2));

  // 3. Easter Monday — Easter + 1
  holidays.push(addDays(easter, 1));

  // 4. Early May Bank Holiday — first Monday in May
  const may1 = new Date(Date.UTC(year, 4, 1));
  const may1dow = may1.getUTCDay();
  const firstMayMonday = may1dow === 1 ? may1 : addDays(may1, (8 - may1dow) % 7);
  holidays.push(firstMayMonday);

  // 5. Spring Bank Holiday — last Monday in May
  const may31 = new Date(Date.UTC(year, 4, 31));
  const may31dow = may31.getUTCDay();
  const lastMayMonday = may31dow === 1 ? may31 : addDays(may31, -(may31dow === 0 ? 6 : may31dow - 1));
  holidays.push(lastMayMonday);

  // 6. Summer Bank Holiday — last Monday in August
  const aug31 = new Date(Date.UTC(year, 7, 31));
  const aug31dow = aug31.getUTCDay();
  const lastAugMonday = aug31dow === 1 ? aug31 : addDays(aug31, -(aug31dow === 0 ? 6 : aug31dow - 1));
  holidays.push(lastAugMonday);

  // 7 & 8. Christmas & Boxing Day with cascade substitution
  const xmas = new Date(Date.UTC(year, 11, 25));
  const boxing = new Date(Date.UTC(year, 11, 26));
  const xmasDow = xmas.getUTCDay();
  if (xmasDow === 6) {
    // Sat: Xmas → Mon 27, Boxing → Tue 28
    holidays.push(addDays(xmas, 2));
    holidays.push(addDays(xmas, 3));
  } else if (xmasDow === 0) {
    // Sun: Xmas → Tue 27, Boxing → Mon 26
    holidays.push(addDays(xmas, 2));
    holidays.push(boxing);
  } else if (xmasDow === 5) {
    // Fri: Xmas → Fri 25, Boxing Sat → Mon 28
    holidays.push(xmas);
    holidays.push(addDays(boxing, 2));
  } else {
    holidays.push(xmas);
    holidays.push(boxing);
  }

  return [...new Set(holidays.map(toIso))].sort();
}

// ── Working-day counter ───────────────────────────────────────────────────────

/**
 * Counts working days (Mon–Fri, excluding England & Wales bank holidays)
 * between startDate and endDate inclusive. Both dates are YYYY-MM-DD strings.
 */
export function countWorkingDays(startDate: string, endDate: string): number {
  const s = new Date(startDate + "T00:00:00Z");
  const e = new Date(endDate + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;

  // Gather bank holidays for all years spanned
  const startYear = s.getUTCFullYear();
  const endYear = e.getUTCFullYear();
  const bankHolidaySet = new Set<string>();
  for (let y = startYear; y <= endYear; y++) {
    for (const d of getEnglandWalesBankHolidays(y)) bankHolidaySet.add(d);
  }

  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getUTCDay();
    const iso = toIso(cur);
    if (dow !== 0 && dow !== 6 && !bankHolidaySet.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// ── Leave year bounds ─────────────────────────────────────────────────────────

/**
 * Given a leaveYearStart string "MM-DD" (e.g. "01-01" or "04-01") and an
 * optional reference date (defaults to today), returns the start and end dates
 * of the leave year that contains the reference date.
 */
export function calculateLeaveYearBounds(
  leaveYearStart: string,
  referenceDate: Date = new Date()
): { yearStart: Date; yearEnd: Date; leaveYear: number } {
  const [mm, dd] = leaveYearStart.split("-").map(Number);
  const refYear = referenceDate.getFullYear();

  // Try building year-start for refYear
  let yearStart = new Date(Date.UTC(refYear, mm - 1, dd));

  // If reference date is before this year's start, use previous year's start
  if (referenceDate < yearStart) {
    yearStart = new Date(Date.UTC(refYear - 1, mm - 1, dd));
  }

  // Year end is one day before next year-start
  const nextYearStart = new Date(yearStart);
  nextYearStart.setUTCFullYear(nextYearStart.getUTCFullYear() + 1);
  const yearEnd = addDays(nextYearStart, -1);

  return { yearStart, yearEnd, leaveYear: yearStart.getUTCFullYear() };
}

// ── Pro-rata entitlement ──────────────────────────────────────────────────────

/** Round up to nearest 0.5 (UK convention — always in employee's favour). */
function roundUpHalf(n: number): number {
  return Math.ceil(n * 2) / 2;
}

/**
 * Calculates an employee's statutory annual leave entitlement under the
 * Working Time Regulations 1998.
 *
 * Full entitlement = contractedDaysPerWeek × 5.6 weeks.
 *
 * For new starters whose employmentStartDate falls within the current leave
 * year, entitlement is accrued at 1/12 per completed calendar month of
 * service, rounded up to the nearest 0.5 day.
 *
 * @param contractedDaysPerWeek - e.g. 5 (full-time), 3 (part-time)
 * @param employmentStartDate   - "YYYY-MM-DD" or null / empty
 * @param leaveYearStart        - "MM-DD" (e.g. "01-01")
 * @param referenceDate         - defaults to today
 * @returns { fullEntitlement, actualEntitlement, isProRata, monthsAccrued }
 */
export function calculateProRataEntitlement(
  contractedDaysPerWeek: number,
  employmentStartDate: string | null | undefined,
  leaveYearStart: string,
  referenceDate: Date = new Date()
): { fullEntitlement: number; actualEntitlement: number; isProRata: boolean; monthsAccrued: number } {
  // Statutory full entitlement (capped at 28 for 5-day workers; uncapped for part-time)
  const fullEntitlement = roundUpHalf(contractedDaysPerWeek * 5.6);

  if (!employmentStartDate) {
    return { fullEntitlement, actualEntitlement: fullEntitlement, isProRata: false, monthsAccrued: 12 };
  }

  const empStart = new Date(employmentStartDate + "T00:00:00Z");
  if (isNaN(empStart.getTime())) {
    return { fullEntitlement, actualEntitlement: fullEntitlement, isProRata: false, monthsAccrued: 12 };
  }

  const { yearStart, yearEnd } = calculateLeaveYearBounds(leaveYearStart, referenceDate);

  // If employment started before or on the leave year start, full entitlement applies
  if (empStart <= yearStart) {
    return { fullEntitlement, actualEntitlement: fullEntitlement, isProRata: false, monthsAccrued: 12 };
  }

  // Employment started within this leave year — calculate accrual
  // Count complete calendar months from empStart to end of leave year
  let months = 0;
  const cur = new Date(empStart);
  while (cur <= yearEnd) {
    // Advance by one month and check if still within leave year
    const next = new Date(cur);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next > yearEnd) break;
    months++;
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  // Also count the partial month at the end as a full month (entitlement accrues from first day)
  months++;

  const monthsAccrued = Math.min(months, 12);
  const actualEntitlement = roundUpHalf((monthsAccrued / 12) * fullEntitlement);

  return { fullEntitlement, actualEntitlement, isProRata: empStart > yearStart, monthsAccrued };
}

// ── Carry-over cap ────────────────────────────────────────────────────────────

/**
 * Applies the carry-over cap. UK law allows up to 8 days discretionary
 * carry-over in a normal leave year (20 days if sick/family leave prevented
 * taking holiday). The maxCarryOverDays field controls this.
 */
export function applyCarryOverCap(carryOver: number, maxCarryOverDays: number): number {
  return Math.min(carryOver, maxCarryOverDays);
}
