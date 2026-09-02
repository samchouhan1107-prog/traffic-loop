// streakService.js — Login streak tracking, server-authoritative.
// Prevents duplicate claims, refresh abuse, and clock manipulation.
import { db, audit } from '../database/connection.js';
import { config } from '../config/environment.js';
import { addBonusAllocation } from './promoService.js';

// ============================================================
// STREAK TRACKING
// ============================================================

/**
 * Get today's date in UTC (YYYY-MM-DD) — server-authoritative, not client clock.
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get yesterday's date in UTC.
 */
function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a login and update streak.
 * Called on every authenticated request (login or session check).
 * Server-authoritative: uses server clock, not client-provided dates.
 * Returns streak info.
 */
export function recordLogin(userId) {
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  let streak = db.prepare('SELECT * FROM login_streaks WHERE user_id = ?').get(userId);

  if (!streak) {
    // First ever login — create streak record
    db.prepare(`INSERT INTO login_streaks (user_id, current_streak, longest_streak, last_login_date, total_bonus_allocation, created_at, updated_at)
      VALUES (?, 1, 1, ?, 0, datetime('now'), datetime('now'))`).run(userId, today);
    audit('system', userId, 'STREAK_STARTED', 'login_streaks', String(userId),
      { after: { streak: 1, date: today } });
    return getStreakStatus(userId);
  }

  if (streak.last_login_date === today) {
    // Already logged in today — no streak change, just return status
    return getStreakStatus(userId);
  }

  // Check if consecutive
  const isConsecutive = streak.last_login_date === yesterday;
  const gracePeriodMs = (config.streak.gracePeriodHours || 36) * 3600_000;
  const lastLoginTime = streak.last_login_date ? new Date(streak.last_login_date + 'T23:59:59Z').getTime() : 0;
  const now = Date.now();
  const withinGrace = lastLoginTime ? (now - lastLoginTime) <= gracePeriodMs : false;

  let newStreak;
  if (isConsecutive || withinGrace) {
    newStreak = streak.current_streak + 1;
  } else {
    // Streak broken — reset to 1
    newStreak = 1;
    audit('system', userId, 'STREAK_BROKEN', 'login_streaks', String(userId),
      { after: { previousStreak: streak.current_streak, newStreak: 1, lastLogin: streak.last_login_date, today } });
  }

  const newLongest = Math.max(streak.longest_streak, newStreak);

  db.prepare(`UPDATE login_streaks
    SET current_streak = ?, longest_streak = ?, last_login_date = ?, updated_at = datetime('now')
    WHERE user_id = ?`).run(newStreak, newLongest, today, userId);

  audit('system', userId, 'STREAK_UPDATED', 'login_streaks', String(userId),
    { after: { streak: newStreak, longest: newLongest, date: today, wasConsecutive: isConsecutive || withinGrace } });

  return getStreakStatus(userId);
}

/**
 * Get streak status for a user.
 */
export function getStreakStatus(userId) {
  const streak = db.prepare('SELECT * FROM login_streaks WHERE user_id = ?').get(userId);
  if (!streak) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: null,
      totalBonusAllocation: 0,
      todayClaimed: false,
      rewards: getRewards(),
      nextReward: getNextReward(0),
    };
  }

  const today = todayUTC();
  const todayClaimed = db.prepare('SELECT 1 FROM streak_claims WHERE user_id = ? AND streak_day = ?')
    .get(userId, streak.current_streak) != null;

  const rewards = getRewards();
  const nextReward = getNextReward(streak.current_streak);

  return {
    currentStreak: streak.current_streak,
    longestStreak: streak.longest_streak,
    lastLoginDate: streak.last_login_date,
    totalBonusAllocation: streak.total_bonus_allocation,
    todayClaimed,
    rewards,
    nextReward,
  };
}

// ============================================================
// REWARD CLAIMING
// ============================================================

/**
 * Claim streak reward for current streak day.
 * Idempotent — claiming twice for same day returns existing claim.
 * Prevents duplicate claims, refresh abuse, clock manipulation.
 */
export function claimStreakReward(userId) {
  const streak = db.prepare('SELECT * FROM login_streaks WHERE user_id = ?').get(userId);
  if (!streak) throw Object.assign(new Error('No streak found — login first'), { status: 400 });

  const today = todayUTC();
  const dayNumber = streak.current_streak;

  if (streak.last_login_date !== today) {
    throw Object.assign(new Error('Login today first to claim rewards'), { status: 400 });
  }

  // Idempotent check — already claimed?
  const existing = db.prepare('SELECT * FROM streak_claims WHERE user_id = ? AND streak_day = ?')
    .get(userId, dayNumber);
  if (existing) {
    return {
      ok: true,
      alreadyClaimed: true,
      claim: existing,
      streak: getStreakStatus(userId),
    };
  }

  // Get reward tier
  const reward = db.prepare('SELECT * FROM streak_rewards WHERE day_number = ? AND active = 1')
    .get(dayNumber);
  if (!reward) {
    return {
      ok: true,
      noReward: true,
      message: `No reward configured for day ${dayNumber}`,
      streak: getStreakStatus(userId),
    };
  }

  // Rate limit: check claim window to prevent rapid claiming
  const claimWindowMs = (config.streak.claimWindowHours || 48) * 3600_000;
  const recentClaims = db.prepare(`SELECT COUNT(*) c FROM streak_claims
    WHERE user_id = ? AND claimed_at > datetime('now', '-' || ? || ' seconds')`)
    .get(userId, Math.floor(claimWindowMs / 1000)).c;

  if (recentClaims >= 3) {
    throw Object.assign(new Error('Too many recent claims — please wait'), { status: 429 });
  }

  // Transaction: claim + add allocation (manual BEGIN/COMMIT for DatabaseSync compatibility)
  db.exec('BEGIN');
  try {
    // Record claim
    db.prepare(`INSERT INTO streak_claims (user_id, streak_day, claimed_at, allocation_added)
      VALUES (?, ?, datetime('now'), ?)`).run(userId, dayNumber, reward.bonus_allocation);

    // Update total bonus in streak record
    db.prepare(`UPDATE login_streaks
      SET total_bonus_allocation = total_bonus_allocation + ?, updated_at = datetime('now')
      WHERE user_id = ?`).run(reward.bonus_allocation, userId);

    // Grant allocation via promo service
    addBonusAllocation(userId, reward.bonus_allocation, `streak_day_${dayNumber}`);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  audit('user', userId, 'STREAK_REWARD_CLAIMED', 'streak_claims', `${userId}_${dayNumber}`,
    { after: { day: dayNumber, bonus: reward.bonus_allocation, label: reward.label } });

  return {
    ok: true,
    alreadyClaimed: false,
    claim: { day: dayNumber, bonus: reward.bonus_allocation, label: reward.label },
    streak: getStreakStatus(userId),
  };
}

// ============================================================
// REWARD TIERS (configurable from backend)
// ============================================================

/**
 * Get all reward tiers.
 */
export function getRewards() {
  return db.prepare('SELECT * FROM streak_rewards WHERE active = 1 ORDER BY day_number ASC').all();
}

/**
 * Get next reward for a given streak day.
 */
function getNextReward(currentDay) {
  const next = db.prepare('SELECT * FROM streak_rewards WHERE day_number > ? AND active = 1 ORDER BY day_number ASC LIMIT 1')
    .get(currentDay);
  return next || null;
}

/**
 * Update a reward tier (admin only, backend-configurable).
 */
export function updateReward(dayNumber, { bonusAllocation, label, active }) {
  const existing = db.prepare('SELECT * FROM streak_rewards WHERE day_number = ?').get(dayNumber);
  if (!existing) {
    if (bonusAllocation != null && label) {
      db.prepare('INSERT INTO streak_rewards (day_number, bonus_allocation, label, active) VALUES (?, ?, ?, ?)')
        .run(dayNumber, bonusAllocation, label, active !== undefined ? (active ? 1 : 0) : 1);
    }
  } else {
    if (bonusAllocation != null) {
      db.prepare('UPDATE streak_rewards SET bonus_allocation = ? WHERE day_number = ?').run(bonusAllocation, dayNumber);
    }
    if (label) {
      db.prepare('UPDATE streak_rewards SET label = ? WHERE day_number = ?').run(label, dayNumber);
    }
    if (active !== undefined) {
      db.prepare('UPDATE streak_rewards SET active = ? WHERE day_number = ?').run(active ? 1 : 0, dayNumber);
    }
  }
  audit('system', null, 'STREAK_REWARD_UPDATED', 'streak_rewards', String(dayNumber),
    { after: { dayNumber, bonusAllocation, label, active } });
}

/**
 * Get claim history for a user.
 */
export function getClaimHistory(userId, limit = 30) {
  return db.prepare('SELECT * FROM streak_claims WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
}

/**
 * Detect potential abuse: multiple accounts claiming from same IP.
 */
export function detectAbuse(ip, userId) {
  const recent = db.prepare(`SELECT DISTINCT s.user_id FROM sessions s
    WHERE s.ip = ? AND s.created_at > datetime('now', '-24 hours')
    AND s.user_id != ?`).all(ip, userId);
  if (recent.length > 5) {
    audit('security', userId, 'POTENTIAL_ABUSE', 'login_streaks', String(userId),
      { after: { ip, recentUsers: recent.length } });
    return { suspicious: true, recentUserCount: recent.length };
  }
  return { suspicious: false };
}
