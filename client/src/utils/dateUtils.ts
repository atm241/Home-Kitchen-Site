import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  parseISO,
} from 'date-fns';

export const formatDate = (date: Date | string, formatStr: string = 'yyyy-MM-dd'): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
};

export const getWeekDays = (date: Date = new Date()): Date[] => {
  const start = startOfWeek(date, { weekStartsOn: 0 }); // Sunday
  return eachDayOfInterval({ start, end: addDays(start, 6) });
};

export const getWeekRange = (date: Date = new Date()) => {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  const end = endOfWeek(date, { weekStartsOn: 0 });
  return { start, end };
};

export const getMonthDays = (date: Date = new Date()): Date[] => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);

  // Include days from previous and next month to fill the calendar grid
  const calendarStart = startOfWeek(start, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(end, { weekStartsOn: 0 });

  return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
};

export const getMonthRange = (date: Date = new Date()) => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return { start, end };
};

export const nextMonth = (date: Date): Date => addMonths(date, 1);
export const prevMonth = (date: Date): Date => subMonths(date, 1);

export const isSameDayUtil = (date1: Date | string, date2: Date | string): boolean => {
  const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
  return isSameDay(d1, d2);
};

export const isSameMonthUtil = (date1: Date, date2: Date): boolean => {
  return isSameMonth(date1, date2);
};

export const parseDate = (dateString: string): Date => {
  return parseISO(dateString);
};

export const getWeekStartDate = (date: Date = new Date()): string => {
  return formatDate(startOfWeek(date, { weekStartsOn: 0 }));
};

export const getWeekEndDate = (date: Date = new Date()): string => {
  return formatDate(endOfWeek(date, { weekStartsOn: 0 }));
};
