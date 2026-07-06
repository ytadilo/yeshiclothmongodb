import React from 'react';

const StatsCard = ({ title, value, change, icon, type = 'accent' }) => {
  const getBadgeClass = () => {
    if (change?.startsWith('+')) return 'badge-success';
    if (change?.startsWith('-')) return 'badge-danger';
    return 'badge-info';
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</span>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          backgroundColor: `var(--${type}-light)`,
          color: `var(--${type})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{value}</span>
        {change && (
          <span className={`badge ${getBadgeClass()}`} style={{ fontSize: '0.675rem' }}>
            {change}
          </span>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
