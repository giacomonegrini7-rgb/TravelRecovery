import { usePath, href } from './lib/router';
import { PublicApp } from './public/PublicApp';
import { PrivacyPage } from './public/PrivacyPage';
import { AdminApp } from './admin/AdminApp';
import { Brand } from './ui/components';
import { PROJECT } from './config/project';

export function App() {
  const path = usePath();
  if (path === '/') return <PublicApp />;
  if (path === '/privacy') return <PrivacyPage />;
  if (path === '/admin' || path.startsWith('/admin/')) return <AdminApp path={path} />;
  return (
    <div className="shell">
      <header className="topbar"><div className="topbar-inner"><Brand name={PROJECT.name} /></div></header>
      <main className="page page-narrow" id="contenuto">
        <h1 className="h-screen">Pagina non trovata</h1>
        <p>L’indirizzo non corrisponde a nessuna pagina.</p>
        <p><a href={href('/')}>Vai al questionario</a></p>
      </main>
    </div>
  );
}
