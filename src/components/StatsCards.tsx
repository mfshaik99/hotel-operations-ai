import React from 'react';
import { CaseItem } from '../types';

interface StatsCardsProps {
  cases: CaseItem[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ cases }) => {
  const total = cases.length;
  const awaiting = cases.filter((c) => c.status === 'Open' || c.status === 'Escalated').length;
  const inProgress = cases.filter((c) => c.status === 'In progress').length;
  const resolved = cases.filter((c) => c.status === 'Resolved').length;

  return (
    <section className="stats">
      <div className="stat">
        <div className="label">Total requests</div>
        <div className="num">{total}</div>
        <div className="hint">All recorded cases</div>
      </div>
      <div className="stat">
        <div className="label">Awaiting action</div>
        <div className="num">{awaiting}</div>
        <div className="hint">Needs department attention</div>
      </div>
      <div className="stat">
        <div className="label">In progress</div>
        <div className="num">{inProgress}</div>
        <div className="hint">Being handled by staff</div>
      </div>
      <div className="stat">
        <div className="label">Resolved</div>
        <div className="num">{resolved}</div>
        <div className="hint">Human-confirmed completion</div>
      </div>
    </section>
  );
};
