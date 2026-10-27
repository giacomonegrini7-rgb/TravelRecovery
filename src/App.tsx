import { usePath, href } from './lib/router';
import { PublicApp } from './public/PublicApp';
import { PrivacyPage } from './public/PrivacyPage';
import { AdminApp } from './admin/AdminApp';
import { Brand } from './ui/components';
import { PROJECT } from './config/project';
import { t, useLang } from './i18n';

export function App() {
  const path = usePath();
  useLang(); // ridisegna tutto al cambio di lingua
  if (path === '/') return <PublicApp />;
  if (path === '/privacy') return <PrivacyPage />;
  if (path === '/admin' || path.startsWith('/admin/')) return <AdminApp path={path} />;
  return (
    <div className="shell">
      <header className="topbar"><div className="topbar-inner"><Brand name={PROJECT.name} /></div></header>
      <main className="page page-narrow" id="contenuto">
        <h1 className="h-screen">{t('notFoundTitle')}</h1>
        <p>{t('notFoundBody')}</p>
        <p><a href={href('/')}>{t('notFoundLink')}</a></p>
      </main>
    </div>
  );
}
