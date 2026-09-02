import React, { useState } from 'react';
import { api } from '../services/api.js';

export default function StreakPanel({ streak, onClaim }) {
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);

  if (!streak) return null;

  const { currentStreak, longestStreak, todayClaimed, nextReward, rewards, totalBonusAllocation } = streak;

  const handleClaim = async () => {
    if (claiming || todayClaimed) return;
    setClaiming(true);
    setClaimResult(null);
    try {
      const result = await api('/api/streak/claim', { method: 'POST', body: {} });
      setClaimResult(result);
      if (onClaim) onClaim(result);
    } catch (e) {
      setClaimResult({ error: e.message });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="streak-panel">
      <div className="streak-header">
        <div className="streak-fire">🔥</div>
        <div className="streak-info">
          <h3>Login Streak</h3>
          <p className="muted">Day {currentStreak} — {currentStreak === 0 ? 'Start your streak!' : 'Keep it going!'}</p>
        </div>
        <div className="streak-stats">
          <div className="streak-stat">
            <span className="streak-stat-value">{currentStreak}</span>
            <span className="streak-stat-label">Current</span>
          </div>
          <div className="streak-stat">
            <span className="streak-stat-value">{longestStreak}</span>
            <span className="streak-stat-label">Best</span>
          </div>
        </div>
      </div>

      {/* Streak timeline */}
      <div className="streak-timeline">
        {rewards.map((r) => {
          const isAchieved = currentStreak >= r.day_number;
          const isCurrent = currentStreak + 1 === r.day_number;
          return (
            <div key={r.day_number} className={`streak-day ${isAchieved ? 'achieved' : ''} ${isCurrent ? 'current' : ''}`}>
              <div className="streak-day-number">
                {isAchieved ? '✓' : `🔥 Day ${r.day_number}`}
              </div>
              <div className="streak-day-label">{r.label}</div>
              <div className="streak-day-bonus">+{r.bonus_allocation.toLocaleString()}</div>
            </div>
          );
        })}
      </div>

      {/* Claim button */}
      <div className="streak-claim">
        {!todayClaimed ? (
          <button className="btn btn-primary streak-claim-btn" onClick={handleClaim} disabled={claiming}>
            {claiming ? 'Claiming…' : `Claim Day ${currentStreak || 1} Reward`}
          </button>
        ) : (
          <div className="streak-claimed">✓ Today's reward claimed</div>
        )}

        {nextReward && (
          <p className="muted streak-next">
            Next reward: Day {nextReward.day_number} — {nextReward.label} (+{nextReward.bonus_allocation.toLocaleString()})
          </p>
        )}

        {totalBonusAllocation > 0 && (
          <p className="streak-total">
            Total bonus allocation from streak: <strong>+{totalBonusAllocation.toLocaleString()}</strong>
          </p>
        )}
      </div>

      {claimResult && (
        <div className={`streak-claim-result ${claimResult.error ? 'error' : 'success'}`}>
          {claimResult.error ? (
            <p className="error">{claimResult.error}</p>
          ) : claimResult.alreadyClaimed ? (
            <p>Already claimed for this streak day.</p>
          ) : claimResult.claim ? (
            <p>🎉 Claimed: Day {claimResult.claim.day} — +{claimResult.claim.bonus.toLocaleString()} ({claimResult.claim.label})</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
