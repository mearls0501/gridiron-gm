export function isMissingSupabaseTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { code?: string; message?: string; details?: string };
  const text = [maybeError.message, maybeError.details].filter(Boolean).join(' ');

  return (
    maybeError.code === 'PGRST205' ||
    text.includes('Could not find the table') ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  );
}
