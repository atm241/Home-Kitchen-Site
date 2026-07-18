import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styles from './Layout.module.css';
import logoImg from '../../HomeKitchen.png';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { household, logout, refreshHousehold } = useAuth();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRegenerateInviteCode = async () => {
    if (!window.confirm('Generate a new invite code? The old code will stop working.')) return;
    await authApi.regenerateInviteCode();
    await refreshHousehold();
  };

  const handleCopyInviteCode = () => {
    if (!household) return;
    navigator.clipboard.writeText(household.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoGroup}>
            <img src={logoImg} alt="Home Kitchen" className={styles.logoImg} />
            <h1 className={styles.logo}>Home Kitchen</h1>
          </div>
          <nav className={styles.nav}>
            <Link
              to="/"
              className={`${styles.navLink} ${isActive('/') ? styles.active : ''}`}
            >
              Home
            </Link>
            <Link
              to="/calendar"
              className={`${styles.navLink} ${isActive('/calendar') ? styles.active : ''}`}
            >
              Calendar
            </Link>
            <Link
              to="/recipes"
              className={`${styles.navLink} ${isActive('/recipes') || location.pathname.startsWith('/recipes/') ? styles.active : ''}`}
            >
              Recipes
            </Link>
            <Link
              to="/pantry"
              className={`${styles.navLink} ${isActive('/pantry') ? styles.active : ''}`}
            >
              Pantry
            </Link>
            <Link
              to="/grocery"
              className={`${styles.navLink} ${isActive('/grocery') ? styles.active : ''}`}
            >
              Grocery List
            </Link>
            <Link
              to="/history"
              className={`${styles.navLink} ${isActive('/history') ? styles.active : ''}`}
            >
              Cook History
            </Link>
          </nav>
          <div className={styles.account}>
            <button
              className={styles.accountButton}
              onClick={() => setShowAccountMenu(!showAccountMenu)}
            >
              {household?.name || 'Account'} ▾
            </button>
            {showAccountMenu && (
              <div className={styles.accountMenu}>
                <div className={styles.accountMenuLabel}>Invite code</div>
                <div className={styles.inviteCodeRow}>
                  <code className={styles.inviteCode}>{household?.inviteCode}</code>
                  <button className={styles.smallButton} onClick={handleCopyInviteCode}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button className={styles.linkButton} onClick={handleRegenerateInviteCode}>
                  Generate new code
                </button>
                <button className={styles.logoutButton} onClick={handleLogout}>
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
};

export default Layout;
