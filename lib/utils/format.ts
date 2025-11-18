import numeral from 'numeral';

/**
 * Format currency values (salaries, cap space, etc.)
 */
export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return numeral(value).format('$0.0a'); // $25.5M
  }
  return numeral(value).format('$0,0'); // $500,000
}

/**
 * Format large numbers (attendance, etc.)
 */
export function formatNumber(value: number): string {
  return numeral(value).format('0,0');
}

/**
 * Format percentages
 */
export function formatPercent(value: number): string {
  return numeral(value).format('0.0%');
}

/**
 * Format contract years for display
 */
export function formatContractYear(value: number): string {
  if (value === 0) return '-';
  return formatCurrency(value);
}

