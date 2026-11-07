import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HostHome, HostSessionPage, RequireAdmin } from './pages/Host';
import { Participant } from './pages/Participant';
import { TestPage } from './pages/Test';
import './style.css';

function Router() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => { const h = () => setPath(window.location.pathname); window.addEventListener('popstate', h); return () => window.removeEventListener('popstate', h); }, []);
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'j' && seg[1] && /^[abAB]$/.test(seg[2] ?? '')) return <Participant key={`${seg[1]}${seg[2]}`} code={seg[1]} layerKey={seg[2]} />;
  if (seg[0] === 'host') return <RequireAdmin>{seg[1] ? <HostSessionPage id={seg[1]} /> : <HostHome />}</RequireAdmin>;
  if (seg[0] === 'test') return <RequireAdmin><TestPage /></RequireAdmin>;
  return <main className="screen"><div className="intro"><h1>Collective Music</h1><p className="muted">Scan a QR code at the site to take part.</p></div></main>;
}
createRoot(document.getElementById('root')!).render(<Router />);
