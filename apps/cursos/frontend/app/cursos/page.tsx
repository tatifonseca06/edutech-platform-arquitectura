import Link from 'next/link';

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
}

async function getCursos(): Promise<Curso[]> {
  try {
    const res = await fetch(
      `${process.env.API_URL_INTERNAL || 'http://app-cursos:3001'}/api/cursos`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

const nivelColor: Record<string, string> = {
  principiante: '#4caf50',
  intermedio: '#ff9800',
  avanzado: '#f44336',
};

export default async function CursosPage() {
  const cursos = await getCursos();

  return (
    <div>
      <h1 style={{ color: '#1a1a2e', marginBottom: '0.5rem' }}>Catálogo de Cursos</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{cursos.length} cursos disponibles</p>

      {cursos.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: '3rem' }}>
          No hay cursos disponibles en este momento.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1.5rem' }}>
          {cursos.map(curso => (
            <Link key={curso.id} href={`/cursos/${curso.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{
                    background: nivelColor[curso.nivel] || '#888',
                    color: 'white',
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {curso.nivel}
                  </span>
                  <span style={{ color: '#1a1a2e', fontWeight: 700, fontSize: '1.1rem' }}>
                    ${Number(curso.precio).toFixed(2)}
                  </span>
                </div>

                <h2 style={{ color: '#1a1a2e', margin: '0 0 0.5rem', fontSize: '1.1rem', lineHeight: 1.3 }}>
                  {curso.titulo}
                </h2>
                <p style={{ color: '#666', fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.4 }}>
                  {curso.descripcion?.slice(0, 90)}{curso.descripcion?.length > 90 ? '…' : ''}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '0.8rem' }}>
                  <span>👤 {curso.instructor}</span>
                  <span>⏱ {curso.duracion_horas}h</span>
                  <span>🎓 {curso.inscritos} inscritos</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
