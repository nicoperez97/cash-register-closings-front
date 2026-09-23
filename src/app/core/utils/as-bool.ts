/** Coerce API/MySQL tinyint flags (0/1) and loose truthy values to real booleans. */
export function asBool(value: unknown, fallback = false): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  if (value == null || value === '') return fallback;
  return Boolean(value);
}
