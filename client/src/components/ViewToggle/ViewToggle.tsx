import React from 'react';
import { Link } from 'react-router-dom';
import styles from './ViewToggle.module.css';

// Week / Month switch shared by the Plan and Calendar pages.
const ViewToggle: React.FC<{ current: 'week' | 'month' }> = ({ current }) => (
  <div className={styles.toggle} role="tablist" aria-label="Plan view">
    <Link to="/plan" role="tab" aria-selected={current === 'week'} className={`${styles.option} ${current === 'week' ? styles.active : ''}`}>
      Week
    </Link>
    <Link to="/calendar" role="tab" aria-selected={current === 'month'} className={`${styles.option} ${current === 'month' ? styles.active : ''}`}>
      Month
    </Link>
  </div>
);

export default ViewToggle;
