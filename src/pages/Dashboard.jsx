import { useAuth } from '../context/AuthContext';
import ProducerDashboard from './ProducerDashboard';
import BuyerDashboard from './BuyerDashboard';
import TransporterDashboard from './TransporterDashboard';
import AdminDashboard from './AdminDashboard';
import PendingApproval from './PendingApproval';

export default function Dashboard() {
  const { userRole, userStatus, logout, refreshProfile } = useAuth();

  if (userRole === 'admin') return <AdminDashboard />;

  if ((userRole === 'producer' || userRole === 'transporter') && userStatus !== 'approved') {
    return <PendingApproval />;
  }

  if (userRole === 'producer') return <ProducerDashboard />;
  if (userRole === 'buyer') return <BuyerDashboard />;
  if (userRole === 'transporter') return <TransporterDashboard />;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f4f6f9', padding: '2rem', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 520, width: '100%', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.06)' }}>
        <h2 style={{ marginTop: 0, color: '#111827' }}>No se pudo cargar tu perfil</h2>
        <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
          Tu sesión está activa, pero no se encontró el rol o estado de tu cuenta. Verifica que la migración de Supabase y el trigger de perfiles estén instalados.
        </p>
        <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={refreshProfile} style={{ padding: '.7rem 1.1rem', borderRadius: 10, border: 'none', background: '#1e5a36', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Reintentar
          </button>
          <button onClick={logout} style={{ padding: '.7rem 1.1rem', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 700, cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
