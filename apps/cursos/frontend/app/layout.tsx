import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EduTech Platform',
  description: 'Plataforma de cursos en línea',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#f5f5f5' }}>
        <header style={{ background: '#1a1a2e', color: 'white', padding: '1rem 2rem' }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: '1.4rem', fontWeight: 700 }}>
              🎓 EduTech
            </a>
            <a href="/cursos" style={{ color: '#e0e0e0', textDecoration: 'none' }}>Cursos</a>
          </nav>
        </header>
        <main style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1rem' }}>
          {children}
        </main>
        <footer style={{ textAlign: 'center', padding: '2rem', color: '#888', borderTop: '1px solid #ddd' }}>
          EduTech Platform © 2024 — Arquitectura de Software
        </footer>
      </body>
    </html>
  );
}
