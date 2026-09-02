import React from 'react';

export default function WalletCard({ wallet }) {
  return (
    <div className="panel wallet-card">
      <h2>BALANCE</h2>
      <p className="balance">{wallet?.balance || 0} credits</p>
      <p className="hint">Credits tied to verified backend operations only.</p>
    </div>
  );
}
