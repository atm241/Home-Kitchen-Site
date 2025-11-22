import React, { useState, useEffect } from 'react';
import { calendarApi } from '../../services/api';
import { CombinedCalendarItem } from '../../types';
import {
  getMonthDays,
  formatDate,
  isSameDayUtil,
  isSameMonthUtil,
  nextMonth,
  prevMonth,
} from '../../utils/dateUtils';
import styles from './Calendar.module.css';

const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarItems, setCalendarItems] = useState<CombinedCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  const monthDays = getMonthDays(currentDate);

  useEffect(() => {
    loadCalendarData();
  }, [currentDate]);

  const loadCalendarData = async () => {
    try {
      setLoading(false);
      const firstDay = monthDays[0];
      const lastDay = monthDays[monthDays.length - 1];

      const response = await calendarApi.getCombined({
        start_date: formatDate(firstDay),
        end_date: formatDate(lastDay),
      });

      setCalendarItems(response.data);
    } catch (error) {
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const getItemsForDay = (day: Date) => {
    return calendarItems.filter((item) => isSameDayUtil(item.date, day));
  };

  const handlePrevMonth = () => {
    setCurrentDate(prevMonth(currentDate));
  };

  const handleNextMonth = () => {
    setCurrentDate(nextMonth(currentDate));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={handlePrevMonth} className={styles.navButton}>
          ← Previous
        </button>
        <h1>{formatDate(currentDate, 'MMMM yyyy')}</h1>
        <button onClick={handleNextMonth} className={styles.navButton}>
          Next →
        </button>
      </div>

      <div className={styles.calendar}>
        <div className={styles.weekDays}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className={styles.weekDay}>
              {day}
            </div>
          ))}
        </div>

        <div className={styles.daysGrid}>
          {monthDays.map((day) => {
            const items = getItemsForDay(day);
            const isToday = isSameDayUtil(day, new Date());
            const isCurrentMonth = isSameMonthUtil(day, currentDate);

            return (
              <div
                key={day.toISOString()}
                className={`${styles.dayCell} ${
                  !isCurrentMonth ? styles.otherMonth : ''
                } ${isToday ? styles.today : ''}`}
              >
                <div className={styles.dayNumber}>{formatDate(day, 'd')}</div>
                <div className={styles.dayItems}>
                  {items.slice(0, 3).map((item) => (
                    <div key={`${item.type}-${item.id}`} className={styles.item}>
                      {item.title}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className={styles.moreItems}>+{items.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Calendar;
