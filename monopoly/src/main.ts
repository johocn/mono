export const VERSION = '0.0.0';

export function boot(): void {
  const el = document.getElementById('stage');
  if (!el) throw new Error('[mono] #stage not found');
}