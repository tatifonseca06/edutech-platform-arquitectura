'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Curso {
  id: string;
  titulo: string;
  descripcion: string;
  instructor: string;
  precio: number;
  duracion_horas: number;
  nivel: string;
  categoria: string;
  inscritos: number;
  created_at: string;
}

export default function CursoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [curso, setCurso] = useState<Curso | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nombre: '', email: '', estudianteId: '' });
  const [inscribiendo, setInscribiendo] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    fetch(`/api/cursos/${id}`)
      .then(r => r.json())
      .then(json => setCurso(json.data))
      .catch(() => setMensaje('Error al cargar el curso.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleInscribir(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre || !form.email) return;
    setInscribiendo(true);
    setMensaje('');
    try {
      const res = await fetch(`/api/cursos/${id}/inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudiante_id: form.estudianteId || crypto.randomUUID(),
          nombre_estudiante: form.nombre,
          email_estudiante: form.email,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMensaje(`¡Inscripción exitosa! Recibirás un email de confirmación en ${form.email}.`);
        setForm({ nombre: '', email: '', estudianteId: '' });
      } else {
        setMensaje(json.error || 'Error al inscribirse.');
      }
    } catch {
      setMensaje('Error de conexión.');
    } finally {
      setInscribiendo(false);
    }
  }

  if (loading) return <p style={{ textAlign: 'center', padding: '3rem' }}>Cargando curso…</p>;
  if (!curso) return <p style={{ textAlign: 'center', color: 'red' }}>Curso no encontrado.</p>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1a1a2e', marginBottom: '1rem', fontSize: '0.9rem' }}>
        ← Volver
      </button>

      <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
        <h1 style={{ color: '#1a1a2e', marginBottom: '0.5rem' }}>{curso.titulo}</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>{curso.descripcion}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            ['👤 Instructor', curso.instructor],
            ['⏱ Duración', `${curso.duracion_horas} horas`],
            ['📊 Nivel', curso.nivel],
            ['🏷 Categoría', curso.categoria],
            ['🎓 Inscritos', String(curso.inscritos)],
            ['💵 Precio', `$${Number(curso.precio).toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label} style={{ background: '#f9f9f9', borderRadius: '8px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>{label}</div>
              <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ color: '#1a1a2e', marginBottom: '1.5rem' }}>Inscribirse al Curso</h2>

        {mensaje && (
          <div style={{
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            background: mensaje.includes('exitosa') ? '#e8f5e9' : '#ffebee',
            color: mensaje.includes('exitosa') ? '#2e7d32' : '#c62828',
          }}>
            {mensaje}
          </div>
        )}

        <form onSubmit={handleInscribir} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[
            { label: 'Nombre completo *', key: 'nombre', type: 'text', placeholder: 'Ej: María García' },
            { label: 'Email *', key: 'email', type: 'email', placeholder: 'Ej: maria@ejemplo.com' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, color: '#333' }}>{label}</label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                required
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={inscribiendo}
            style={{
              background: inscribiendo ? '#ccc' : '#1a1a2e',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: inscribiendo ? 'not-allowed' : 'pointer',
            }}
          >
            {inscribiendo ? 'Procesando…' : 'Inscribirme ahora'}
          </button>
        </form>
      </div>
    </div>
  );
}
