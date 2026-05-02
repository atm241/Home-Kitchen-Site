import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';
import logoImg from '../../HomeKitchen.png';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

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
          </nav>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
};

export default Layout;
