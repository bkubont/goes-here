import {
  typeDefaultDuration,
  MIN_FAMILY_AVG_SAMPLES,
  DEFAULT_BLOCK_MINUTES,
} from "@/lib/durationDefaults";

/**
 * Estimation order (first hit wins):
 * 1. Manual — never overwrite; return existing if duration_source === 'manual'
 * 2. Family historical average — by (type, category) then by type, min 3 samples
 * 3. Type/category defaults
 * 4. Quick Add AI — caller may pass aiMinutes; only applied if still null after 2–3
 *
 * Returns { duration_minutes, duration_source } or null if nothing to set.
 */

function sampleDuration(item) {
  if (item.actual_duration_minutes != null && item.actual_duration_minutes > 0) {
    return Number(item.actual_duration_minutes);
  }
  if (item.completed && item.duration_minutes != null && item.duration_minutes > 0) {
    return Number(item.duration_minutes);
  }
  return null;
}

function average(nums) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function familyAverageDuration(items, type, category) {
  const pool = items || [];
  if (type && category) {
    const byBoth = pool
      .filter((i) => i.type === type && i.category === category)
      .map(sampleDuration)
      .filter((n) => n != null);
    if (byBoth.length >= MIN_FAMILY_AVG_SAMPLES) return average(byBoth);
  }
  if (type) {
    const byType = pool
      .filter((i) => i.type === type)
      .map(sampleDuration)
      .filter((n) => n != null);
    if (byType.length >= MIN_FAMILY_AVG_SAMPLES) return average(byType);
  }
  return null;
}

/**
 * @param {object} item - partial item (type, category, duration_minutes, duration_source)
 * @param {object[]} allItems - family items for averages
 * @param {number|null} aiMinutes - optional AI suggestion from Quick Add
 */
export function estimateDuration(item, allItems = [], aiMinutes = null) {
  if (item?.duration_source === "manual" && item.duration_minutes != null) {
    return {
      duration_minutes: Number(item.duration_minutes),
      duration_source: "manual",
    };
  }

  // Already has a non-manual duration — keep it unless caller is filling a null.
  if (item?.duration_minutes != null && item.duration_minutes > 0 && item.duration_source) {
    return {
      duration_minutes: Number(item.duration_minutes),
      duration_source: item.duration_source,
    };
  }

  const fam = familyAverageDuration(allItems, item?.type, item?.category);
  if (fam != null) {
    return { duration_minutes: fam, duration_source: "family_avg" };
  }

  const typeDef = typeDefaultDuration(item?.type, item?.category);
  if (typeDef != null) {
    // Prefer AI when utterance implied length and we only have a generic default.
    if (aiMinutes != null && Number(aiMinutes) > 0) {
      return { duration_minutes: Math.round(Number(aiMinutes)), duration_source: "ai" };
    }
    return { duration_minutes: typeDef, duration_source: "type_default" };
  }

  if (aiMinutes != null && Number(aiMinutes) > 0) {
    return { duration_minutes: Math.round(Number(aiMinutes)), duration_source: "ai" };
  }

  return { duration_minutes: DEFAULT_BLOCK_MINUTES, duration_source: "type_default" };
}

/** Resolve display/block height minutes (never null). */
export function resolveBlockMinutes(item, allItems = []) {
  if (item?.duration_minutes != null && item.duration_minutes > 0) {
    return Number(item.duration_minutes);
  }
  return estimateDuration(item || {}, allItems).duration_minutes;
}

/**
 * Build create/update patch fields for duration when saving a new or estimated item.
 * Does not overwrite manual.
 */
export function applyDurationEstimate(item, allItems = [], aiMinutes = null) {
  if (item?.duration_source === "manual" && item.duration_minutes != null) {
    return {
      duration_minutes: Number(item.duration_minutes),
      duration_source: "manual",
    };
  }
  if (item?.duration_minutes != null && item.duration_minutes > 0 && !aiMinutes) {
    // User or prior estimate already set on draft — keep, mark source if missing.
    return {
      duration_minutes: Number(item.duration_minutes),
      duration_source: item.duration_source || (aiMinutes ? "ai" : "type_default"),
    };
  }
  // Explicit AI on draft: prefer if no manual.
  if (aiMinutes != null && Number(aiMinutes) > 0 && item?.duration_source !== "manual") {
    const fam = familyAverageDuration(allItems, item?.type, item?.category);
    if (fam != null) {
      return { duration_minutes: fam, duration_source: "family_avg" };
    }
    // AI wins over bare type default when utterance implies length.
    return {
      duration_minutes: Math.round(Number(aiMinutes)),
      duration_source: "ai",
    };
  }
  return estimateDuration(item, allItems, aiMinutes);
}

/**
 * Sync completed ↔ board_status and optionally capture actual duration.
 * Prefer completionBoardPatch from @/lib/boards when columns are known.
 */
export function completionPatch(item, completed) {
  if (completed) {
    return {
      completed: true,
      completed_date: new Date().toISOString(),
      board_status: "done",
      actual_duration_minutes:
        item.actual_duration_minutes != null
          ? item.actual_duration_minutes
          : item.duration_minutes != null
            ? Number(item.duration_minutes)
            : null,
    };
  }
  return {
    completed: false,
    completed_date: null,
    board_status: item.board_status === "done" ? "backlog" : item.board_status || "backlog",
  };
}

/**
 * When board column changes (legacy status_key API).
 * Prefer boardColumnPatch from @/lib/boards when you have a column row.
 */
export function boardStatusPatch(status, { isDone } = {}) {
  const done = isDone != null ? !!isDone : status === "done";
  if (done) {
    return {
      board_status: status || "done",
      completed: true,
      completed_date: new Date().toISOString(),
    };
  }
  return {
    board_status: status,
    completed: false,
    completed_date: null,
  };
}
