// Prueba unitaria: registro (AUTH-REG-01). Detecta el defecto BUG-01 (typo toLower).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const signUp = vi.fn().mockResolvedValue({
  data: { session: null, user: { id: 'u1', email: 'nuevo@correo.com' } }, error: null,
});
vi.mock('../../src/services/supabase.js', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signUp: (...a) => signUp(...a),
    },
  },
}));

import { AuthProvider, useAuth } from '../../src/context/AuthContext.jsx';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

async function getAuth() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current).toBeTruthy());
  return hook;
}

describe('register', () => {
  it('AUTH-REG-01: registra un comprador y normaliza el correo a minúsculas', async () => {
    const { result } = await getAuth();
    await result.current.register('Ana Pérez', ' Ana@Correo.COM ', 'secreto1', 'buyer');
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp.mock.calls[0][0].email).toBe('ana@correo.com');
  });

  it('rechaza contraseñas cortas y roles no públicos', async () => {
    const { result } = await getAuth();
    await expect(result.current.register('Ana', 'a@b.co', '123', 'buyer')).rejects.toThrow(/6 caracteres/);
    await expect(result.current.register('Ana', 'a@b.co', '123456', 'admin')).rejects.toThrow(/rol válido/);
  });
});
