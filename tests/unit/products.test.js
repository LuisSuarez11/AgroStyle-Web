// Pruebas unitarias: reglas de productos y geolocalización
import { describe, it, expect } from 'vitest';
import { getSuggestedPrice, isPreorder, daysUntilAvailable } from '../../src/services/products.js';
import { haversineKm, formatDistance, DEFAULT_CENTER } from '../../src/utils/geo.js';

const dayOffset = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('getSuggestedPrice', () => {
  it('devuelve el precio de la tabla', () => {
    expect(getSuggestedPrice('frutas', 'kg')).toBe(8);
    expect(getSuggestedPrice('lacteos', 'caja')).toBe(85);
  });
  it('devuelve null para categoría o unidad inexistente', () => {
    expect(getSuggestedPrice('autos', 'kg')).toBeNull();
    expect(getSuggestedPrice('frutas', 'tonelada')).toBeNull();
  });
});

describe('preventa', () => {
  it('sin fecha no es preventa', () => {
    expect(isPreorder({})).toBe(false);
    expect(daysUntilAvailable({})).toBe(0);
  });
  it('fecha futura es preventa y cuenta días', () => {
    const p = { availableDate: dayOffset(5) };
    expect(isPreorder(p)).toBe(true);
    expect(daysUntilAvailable(p)).toBeGreaterThanOrEqual(4);
  });
  it('fecha pasada no es preventa', () => {
    const p = { availableDate: dayOffset(-3) };
    expect(isPreorder(p)).toBe(false);
    expect(daysUntilAvailable(p)).toBe(0);
  });
});

describe('geo', () => {
  it('distancia a sí mismo es 0', () => {
    expect(haversineKm(DEFAULT_CENTER, DEFAULT_CENTER)).toBeCloseTo(0, 5);
  });
  it('Santa Cruz a Cochabamba ronda 300-340 km (línea recta ≈ 318 km)', () => {
    const d = haversineKm(DEFAULT_CENTER, { lat: -17.3895, lng: -66.1568 });
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(340);
  });
  it('devuelve null si falta una coordenada', () => {
    expect(haversineKm(null, DEFAULT_CENTER)).toBeNull();
  });
  it('formatea metros, km con decimal y km redondeados', () => {
    expect(formatDistance(0.5)).toBe('500 m');
    expect(formatDistance(4.26)).toBe('4.3 km');
    expect(formatDistance(42.4)).toBe('42 km');
    expect(formatDistance(null)).toBe('—');
  });
});
