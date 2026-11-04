import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import styles from './Layout.module.css';
import Logo from '../Brand/Logo';
import Icon, { IconName } from '../Icon/Icon';
import { useAuth } from '../../context/AuthContext';
import { authApi, HouseholdMember } from '../../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, household, logout, refreshHousehold } = useAuth();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Resetting a housemate's forgotten password
  const [showResetModal, setShowResetModal] = useState(false);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<number | ''>('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openPasswordModal = () => {
    setShowAccountMenu(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
    setShowPasswordModal(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    try {
      setSavingPassword(true);
      await authApi.changePassword({ currentPassword, newPassword });
      setPasswordSuccess(true);
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (error: any) {
      setPasswordError(error.response?.data?.error || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const openResetModal = async () => {
    setShowAccountMenu(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setResetTargetId('');
    setResetError('');
    setResetSuccess('');
    setShowResetModal(true);

    try {
      setMembersLoading(true);
      const response = await authApi.householdMembers();
      // You reset your own password through Change Password, which requires
      // knowing the old one — so exclude yourself from this list.
      setMembers(response.data.filter((m) => m.id !== user?.id));
    } catch {
      setResetError('Could not load household members');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleResetMemberPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!resetTargetId) {
      setResetError('Choose whose password to reset');
      return;
    }
    if (newPassword.length < 8) {
      setResetError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('New passwords do not match');
      return;
    }

    try {
      setResettingPassword(true);
      const response = await authApi.resetMemberPassword(Number(resetTargetId), {
        currentPassword,
        newPassword,
      });
      setResetSuccess(`Password reset for ${response.data.name}.`);
      setTimeout(() => setShowResetModal(false), 2500);
    } catch (error: any) {
      setResetError(error.response?.data?.error || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
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

  // Close the account menu on navigation or an outside tap.
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => setShowAccountMenu(false), [location.pathname]);
  useEffect(() => {
    if (!showAccountMenu) return;
    const close = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setShowAccountMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showAccountMenu]);

  // Recipes live at "/" and "/recipes/:id", so both count as the Cookbook tab.
  const isCookbook = location.pathname === '/' || location.pathname.startsWith('/recipes');
  // Cook mode is full-screen: no header or tab bar.
  const immersive = /^\/recipes\/\d+\/cook/.test(location.pathname);

  const NAV: Array<{ to: string; label: string; icon: IconName; active?: boolean }> = [
    { to: '/', label: 'Cookbook', icon: 'book', active: isCookbook },
    { to: '/plan', label: 'Plan', icon: 'calendar', active: ['/plan', '/plan/auto', '/calendar'].includes(location.pathname) },
    { to: '/grocery', label: 'Grocery', icon: 'cart' },
    { to: '/pantry', label: 'Pantry', icon: 'pantry' },
  ];

  const initials = (user?.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const navClass = (item: typeof NAV[number]) => ({ isActive }: { isActive: boolean }) =>
    `${styles.navLink} ${(item.active ?? isActive) ? styles.active : ''}`;
  const tabClass = (item: typeof NAV[number]) => ({ isActive }: { isActive: boolean }) =>
    `${styles.tab} ${(item.active ?? isActive) ? styles.tabActive : ''}`;

  if (immersive) {
    return <div className={styles.immersive}>{children}</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" className={styles.logoLink} aria-label="Cookbook">
            <Logo size={30} />
          </Link>
          <nav className={styles.nav} aria-label="Main">
            {NAV.map(item => (
              <NavLink key={item.to} to={item.to} end className={navClass(item)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.headerActions}>
            <Link to="/import" className={`btn btn-primary ${styles.addButton}`}>
              <Icon name="plus" size={18} strokeWidth={2.5} /> Add recipe
            </Link>
            <div className={styles.account} ref={accountRef}>
              <button
                className={styles.avatar}
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
                aria-label="Account"
              >
                {initials}
              </button>
              {showAccountMenu && (
                <div className={styles.accountMenu} role="menu">
                  <div className={styles.accountHeader}>
                    <div className={styles.accountName}>{user?.name}</div>
                    <div className={styles.accountSub}>{household?.name}</div>
                  </div>
                  <Link to="/settings/share" className={styles.menuItem}>
                    <Icon name="phone" size={18} /> Save from your phone
                  </Link>
                  <Link to="/history" className={styles.menuItem}>
                    <Icon name="clock" size={18} /> Cook history
                  </Link>
                  <div className={styles.menuDivider} />
                  <div className={styles.accountMenuLabel}>Household invite code</div>
                  <div className={styles.inviteCodeRow}>
                    <code className={styles.inviteCode}>{household?.inviteCode}</code>
                    <button className={styles.smallButton} onClick={handleCopyInviteCode}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <button className={styles.menuItem} onClick={handleRegenerateInviteCode}>
                    <Icon name="users" size={18} /> New invite code
                  </button>
                  <button className={styles.menuItem} onClick={openPasswordModal}>
                    <Icon name="key" size={18} /> Change password
                  </button>
                  <button className={styles.menuItem} onClick={openResetModal}>
                    <Icon name="user" size={18} /> Reset a member's password
                  </button>
                  <div className={styles.menuDivider} />
                  <button className={`${styles.menuItem} ${styles.logoutItem}`} onClick={handleLogout}>
                    <Icon name="logout" size={18} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Phone navigation: thumb-reachable tabs with a raised "add" button. */}
      <nav className={styles.tabBar} aria-label="Main">
        {NAV.slice(0, 2).map(item => (
          <NavLink key={item.to} to={item.to} end className={tabClass(item)}>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <Link to="/import" className={styles.tabAdd} aria-label="Add recipe">
          <Icon name="plus" size={26} strokeWidth={2.5} />
        </Link>
        {NAV.slice(2).map(item => (
          <NavLink key={item.to} to={item.to} end className={tabClass(item)}>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      {showPasswordModal && (
        <div className={styles.modal} onClick={() => setShowPasswordModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Change password</h2>
            {passwordSuccess ? (
              <div className={styles.passwordSuccess}>Password updated.</div>
            ) : (
              <form onSubmit={handleChangePassword} className={styles.passwordForm}>
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {passwordError && <div className={styles.passwordError}>{passwordError}</div>}
                <div className={styles.modalActions}>
                  <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                    {savingPassword ? 'Saving...' : 'Update Password'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowPasswordModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {showResetModal && (
        <div className={styles.modal} onClick={() => setShowResetModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Reset a member's password</h2>
            {resetSuccess ? (
              <div className={styles.passwordSuccess}>{resetSuccess}</div>
            ) : membersLoading ? (
              <div className={styles.passwordHint}>Loading household members…</div>
            ) : members.length === 0 ? (
              <div className={styles.passwordHint}>
                There's nobody else in your household yet. Share your invite code to add
                someone.
              </div>
            ) : (
              <form onSubmit={handleResetMemberPassword} className={styles.passwordForm}>
                <p className={styles.passwordHint}>
                  For when someone forgets their password. They'll sign in with the new one
                  and can change it afterwards.
                </p>
                <select
                  value={resetTargetId}
                  onChange={(e) => setResetTargetId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Whose password?</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  placeholder="New password for them (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <input
                  type="password"
                  placeholder="Confirm their new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <input
                  type="password"
                  placeholder="Your own password, to confirm it's you"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                {resetError && <div className={styles.passwordError}>{resetError}</div>}
                <div className={styles.modalActions}>
                  <button type="submit" className="btn btn-primary" disabled={resettingPassword}>
                    {resettingPassword ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowResetModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <main className={styles.main}>{children}</main>
    </div>
  );
};

export default Layout;
