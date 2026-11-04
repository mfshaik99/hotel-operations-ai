import React from 'react';
import { NavTab, Department, CaseItem } from '../types';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  cases: CaseItem[];
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  cases,
  isOpenMobile,
  onCloseMobile,
}) => {
  const getDeptCount = (dept: Department) => {
    return cases.filter((c) => c.department === dept && c.status !== 'Resolved').length;
  };

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <aside className={`side ${isOpenMobile ? 'open' : ''}`}>
      <div className="brand">
        hotel<span>ops</span>.ai
      </div>
      <div className="subbrand">HUMAN + AI OPERATIONS</div>

      <div className="navlabel">WORKSPACE</div>
      <button
        type="button"
        className={`navitem ${currentTab === 'overview' ? 'active' : ''}`}
        onClick={() => handleSelect('overview')}
      >
        <span>▦ &nbsp; Operations overview</span>
      </button>
      <button
        type="button"
        className={`navitem ${currentTab === 'requests' ? 'active' : ''}`}
        onClick={() => handleSelect('requests')}
      >
        <span>▤ &nbsp; Guest requests</span>
        <span className="navcount">{cases.length}</span>
      </button>
      <button
        type="button"
        className={`navitem ${currentTab === 'departments' ? 'active' : ''}`}
        onClick={() => handleSelect('departments')}
      >
        <span>♧ &nbsp; Departments</span>
      </button>
      <button
        type="button"
        className={`navitem ${currentTab === 'activity' ? 'active' : ''}`}
        onClick={() => handleSelect('activity')}
      >
        <span>◷ &nbsp; Activity log</span>
      </button>

      <div className="navlabel">DEPARTMENTS</div>
      <button
        type="button"
        className={`navitem ${currentTab === 'dept-reception' ? 'active' : ''}`}
        onClick={() => handleSelect('dept-reception')}
      >
        <span>⌂ &nbsp; Reception</span>
        <span className="navcount">{getDeptCount('Reception')}</span>
      </button>
      <button
        type="button"
        className={`navitem ${currentTab === 'dept-housekeeping' ? 'active' : ''}`}
        onClick={() => handleSelect('dept-housekeeping')}
      >
        <span>✧ &nbsp; Housekeeping</span>
        <span className="navcount">{getDeptCount('Housekeeping')}</span>
      </button>
      <button
        type="button"
        className={`navitem ${currentTab === 'dept-maintenance' ? 'active' : ''}`}
        onClick={() => handleSelect('dept-maintenance')}
      >
        <span>⚙ &nbsp; Maintenance</span>
        <span className="navcount">{getDeptCount('Maintenance')}</span>
      </button>

      <div className="sidefoot">HACKATHON MVP · DEMO DATA ONLY</div>
    </aside>
  );
};
