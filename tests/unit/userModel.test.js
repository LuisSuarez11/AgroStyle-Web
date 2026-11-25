// Pruebas unitarias: modelo de usuario (AUTH-02 - parte de dominio, F2)
import { describe, it, expect } from 'vitest';
import {
  USER_ROLES, normalizeRole, isPublicRegisterRole, getInitialApprovalStatus,
  hasEffectiveAccess, normalizeUserProfile, USER_PROFILE_OWNER_EDITABLE_KEYS,
} from '../../src/domain/userModel.js';

describe('normalizeRole', () => {
  it('acepta los cuatro roles válidos', () => {
    for (const r of Object.values(USER_ROLES)) expect(normalizeRole(r)).toBe(r);
  });
  it('rechaza roles desconocidos o vacíos', () => {
    expect(normalizeRole('superadmin')).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});

describe('registro público (AUTH-02: no autoasignarse admin)', () => {
  it('admin NO es un rol de registro público', () => {
    expect(isPublicRegisterRole('admin')).toBe(false);
  });
  it('buyer, producer y transporter sí lo son', () => {
    expect(isPublicRegisterRole('buyer')).toBe(true);
    expect(isPublicRegisterRole('producer')).toBe(true);
    expect(isPublicRegisterRole('transporter')).toBe(true);
  });
  it('el dueño del perfil solo puede editar nombre y fecha de actualización', () => {
    expect([...USER_PROFILE_OWNER_EDITABLE_KEYS].sort()).toEqual(['fullName', 'updatedAt']);
    expect(USER_PROFILE_OWNER_EDITABLE_KEYS).not.toContain('role');
  });
});

describe('estado inicial de aprobación', () => {
  it('comprador queda aprobado', () => {
    expect(getInitialApprovalStatus('buyer')).toBe('approved');
  });
  it('productor y transportista quedan pendientes', () => {
    expect(getInitialApprovalStatus('producer')).toBe('pending');
    expect(getInitialApprovalStatus('transporter')).toBe('pending');
  });
  it('admin o rol inválido no recibe estado inicial', () => {
    expect(getInitialApprovalStatus('admin')).toBeNull();
    expect(getInitialApprovalStatus('x')).toBeNull();
  });
});

describe('hasEffectiveAccess', () => {
  it('requiere aprobado Y activo', () => {
    expect(hasEffectiveAccess({ approvalStatus: 'approved', accountStatus: 'active' })).toBe(true);
    expect(hasEffectiveAccess({ approvalStatus: 'pending', accountStatus: 'active' })).toBe(false);
    expect(hasEffectiveAccess({ approvalStatus: 'approved', accountStatus: 'disabled' })).toBe(false);
    expect(hasEffectiveAccess(null)).toBe(false);
  });
});

describe('normalizeUserProfile', () => {
  it('devuelve null si no hay datos', () => {
    expect(normalizeUserProfile(null)).toBeNull();
  });
  it('anula valores inválidos de rol y estados', () => {
    const p = normalizeUserProfile({ role: 'hacker', approvalStatus: 'ok', accountStatus: 'raro' });
    expect(p.role).toBeNull();
    expect(p.approvalStatus).toBeNull();
    expect(p.accountStatus).toBeNull();
  });
  it('conserva datos válidos', () => {
    const p = normalizeUserProfile({ uid: 'u1', email: 'a@b.c', fullName: 'Ana', role: 'buyer', approvalStatus: 'approved', accountStatus: 'active' });
    expect(p).toMatchObject({ uid: 'u1', fullName: 'Ana', role: 'buyer' });
  });
});
