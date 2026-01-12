export function toCssAspectRatio(input?: string, fallback: string = '3:4'): string {
  const parse = (value: string): [number, number] | null => {
    const normalized = value.trim();
    if (!normalized) return null;
    const parts = normalized.split(/[/:]/).map((p) => Number(p.trim()));
    if (parts.length < 2) return null;
    const [w, h] = parts;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return [w, h];
  };

  const parsed = input ? parse(input) : null;
  const parsedFallback = parse(fallback);
  const [w, h] = parsed ?? parsedFallback ?? [3, 4];
  return `${w} / ${h}`;
}
