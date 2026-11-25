import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, rejection_reason, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[profile] fetch error', error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    role: data.role,
    status: data.status,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at,
  };
}

function SupabaseConfigScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f6f9', padding: '2rem', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ maxWidth: 720, width: '100%', background: '#fff', borderRadius: 16, padding: '2rem', boxShadow: '0 8px 30px rgba(0,0,0,.06)' }}>
        <h1 style={{ margin: 0, color: '#1e5a36', fontSize: '1.8rem' }}>Configura Supabase para iniciar AgroStyle</h1>
        <p style={{ color: '#4b5563', lineHeight: 1.6 }}>
          El proyecto ya está listo, pero falta conectar las credenciales de Supabase. Sin esto, el registro, inicio de sesión y datos no pueden funcionar.
        </p>
        <ol style={{ color: '#374151', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
          <li>Crea un proyecto en Supabase y ejecuta <code>supabase/migration.sql</code> en el SQL Editor.</li>
          <li>Crea un bucket público llamado <code>agrostyle</code> en Storage.</li>
          <li>Copia <code>.env.example</code> a <code>.env.local</code> y completa <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Reinicia el servidor de desarrollo con <code>npm run dev</code>.</li>
        </ol>
        <p style={{ marginBottom: 0, color: '#6b7280', fontSize: '.9rem' }}>
          Los datos de acceso del proyecto se encuentran en Supabase &rarr; Settings &rarr; API.
        </p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured();
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userStatus, setUserStatus] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(configured);

  async function applySession(session) {
    const user = session?.user || null;
    if (!user) {
      setCurrentUser(null);
      setUserRole(null);
      setUserStatus(null);
      setUserData(null);
      return;
    }

    setCurrentUser({ id: user.id, uid: user.id, email: user.email });

    const profile = await fetchProfile(user.id);
    if (profile) {
      setUserRole(profile.role);
      setUserStatus(profile.status);
      setUserData(profile);
    } else {
      const metaRole = user.user_metadata?.role;
      const fallbackRole = ['producer', 'buyer', 'transporter', 'admin'].includes(metaRole) ? metaRole : null;
      const fallbackStatus = fallbackRole === 'buyer' || fallbackRole === 'admin' ? 'approved' : fallbackRole ? 'pending' : null;
      setUserRole(fallbackRole);
      setUserStatus(fallbackStatus);
      setUserData({
        id: user.id,
        fullName: user.user_metadata?.full_name || '',
        email: user.email,
        role: fallbackRole,
        status: fallbackStatus,
      });
    }
  }

  useEffect(() => {
    if (!configured) return undefined;

    let mounted = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('[auth] getSession error', error);
      await applySession(data?.session ?? null);
      if (mounted) setLoading(false);
    }).catch((err) => {
      console.error('[auth] getSession failed', err);
      if (mounted) setLoading(false);
    });

    // BUG-03: hacer 'await' de llamadas a supabase dentro de este callback provoca un
    // interbloqueo (deadlock) con el lock interno de auth-js: al recargar con sesión activa la
    // pantalla quedaba en blanco. Se difiere la tarea fuera del callback (workaround oficial).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(async () => {
        if (!mounted) return;
        await applySession(session);
        if (mounted) setLoading(false);
      }, 0);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [configured]);

  async function register(fullName, email, password, role) {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) throw new Error('El nombre completo es obligatorio.');
    if (!cleanEmail) throw new Error('El correo electrónico es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Ingresa un correo electrónico válido.');
    if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    if (!['producer', 'buyer', 'transporter'].includes(role)) throw new Error('Selecciona un rol válido.');

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: cleanName, role },
      },
    });
    if (error) throw error;

    if (data?.session) {
      await applySession(data.session);
    } else if (data?.user) {
      setCurrentUser({ id: data.user.id, uid: data.user.id, email: data.user.email });
      setUserRole(role);
      setUserStatus(role === 'buyer' ? 'approved' : 'pending');
      setUserData({
        id: data.user.id,
        fullName: cleanName,
        email: cleanEmail,
        role,
        status: role === 'buyer' ? 'approved' : 'pending',
      });
    }
    return data;
  }

  async function login(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) throw new Error('Correo y contraseña son obligatorios.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw error;
    await applySession(data.session);
    return data;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setCurrentUser(null);
    setUserRole(null);
    setUserStatus(null);
    setUserData(null);
  }

  async function refreshProfile() {
    if (!currentUser) return;
    const profile = await fetchProfile(currentUser.id);
    if (profile) {
      setUserRole(profile.role);
      setUserStatus(profile.status);
      setUserData(profile);
    }
  }

  const value = {
    currentUser,
    userRole,
    userStatus,
    userData,
    loading,
    isConfigured: configured,
    login,
    register,
    logout,
    refreshProfile,
  };

  if (!configured) {
    return <SupabaseConfigScreen />;
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
