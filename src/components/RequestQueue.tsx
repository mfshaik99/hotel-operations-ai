import React, { useState } from 'react';
import { CaseItem, Status } from '../types';
import { getStatusBadgeClass } from '../utils';

interface RequestQueueProps {
  cases: CaseItem[];
  onAccept: (id: string) => void;
  onResolveRequest: (id: string) => void;
  onEscalate: (id: string) => void;
  onResetDemo: () => void;
  activeFilterTitle?: string;
}

export const RequestQueue: React.FC<RequestQueueProps> = ({
  cases,
  onAccept,
  onResolveRequest,
  onEscalate,
  onResetDemo,
  activeFilterTitle,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Status>('All');

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.room.includes(searchTerm) ||
      c.department.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="panel">
      <div className="panelhead">
        <div>
          <div className="paneltitle">
            Guest request queue {activeFilterTitle ? `(${activeFilterTitle})` : ''}
          </div>
          <div className="small">Track ownership, priority and completion</div>
        </div>
        <button className="btn ghost" onClick={onResetDemo} type="button">
          Reset demo
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search requests, room, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'All' | Status)}
        >
          <option value="All">All statuses</option>
          <option value="Open">Open</option>
          <option value="In progress">In progress</option>
          <option value="Escalated">Escalated</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Request</th>
              <th>Department</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.length > 0 ? (
              filteredCases.map((c) => {
                const badgeClass = getStatusBadgeClass(c.status);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="caseid">{c.id}</span>
                      <br />
                      <span className="small">Room {c.room}</span>
                    </td>
                    <td>
                      <span className="case-title">{c.title}</span>
                      <br />
                      <span className="small">
                        {c.source} {c.completedBy ? `· Confirmed by ${c.completedBy}` : ''}
                      </span>
                    </td>
                    <td className="dept">{c.department}</td>
                    <td>{c.priority}</td>
                    <td>
                      <span className={`tag ${badgeClass}`}>{c.status}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {c.status === 'Open' && (
                          <button
                            type="button"
                            className="action"
                            onClick={() => onAccept(c.id)}
                            title="Accept request"
                          >
                            Accept
                          </button>
                        )}
                        {c.status !== 'Resolved' && (
                          <button
                            type="button"
                            className="action"
                            onClick={() => onResolveRequest(c.id)}
                            title="Confirm physical completion"
                          >
                            Confirm done
                          </button>
                        )}
                        {c.status !== 'Resolved' && c.status !== 'Escalated' && (
                          <button
                            type="button"
                            className="action action-escalate"
                            onClick={() => onEscalate(c.id)}
                            title="Escalate issue to management"
                          >
                            Escalate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="empty">
                  No guest requests match the current criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="notice">
        Human-in-the-loop: an AI or workflow may recommend and route work, but only a staff member
        can confirm physical completion and resolve a case.
      </div>
    </div>
  );
};
