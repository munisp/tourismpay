import { format, differenceInDays, isPast, addDays } from 'date-fns';

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy');
}

export function daysUntilExpiry(endDate: string): number {
  return differenceInDays(new Date(endDate), new Date());
}

export function isExpired(endDate: string): boolean {
  return isPast(new Date(endDate));
}

export function renewalDate(endDate: string, daysBeforeExpiry: number = 30): Date {
  return addDays(new Date(endDate), -daysBeforeExpiry);
}
