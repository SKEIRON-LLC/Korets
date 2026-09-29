'use client';

import { createElement, useEffect, useState } from 'react';
import { ArrowLeft, Box, ChevronRight, Hand, Maximize2, Minimize2, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import seedExhibits from '@/data/seed-exhibits.json';

type Exhibit = { id: string; title: string; period: string; category: string; summary: string; model: string; poster?: string; cameraOrbit?: string };
const blank = { title: '', period: '', category: '', summary: '', model: '', poster: '' };

function apiBase() {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

function assetUrl(path?: string) {
  if (!path) return undefined;
  const localAsset = path.match(/^http:\/\/(?:localhost|127\.0\.0\.1):3001(\/assets\/.*)$/)?.[1];
  if (localAsset) return `${apiBase()}${localAsset}`;
  return path.startsWith('/assets/') ? `${apiBase()}${path}` : path;
}

async function apiRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { credentials: 'include', ...init });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'Не вдалося виконати дію');
  return result as T;
}

function ModelPreview({ exhibit, interactive = false }: { exhibit: Exhibit; interactive?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    import('@google/model-viewer').then(() => active && setReady(true)).catch(() => active && setReady(false));
    return () => { active = false; };
  }, []);
  if (!ready) return exhibit.poster
    ? <img className="model-poster" src={exhibit.poster} alt={exhibit.title} />
    : <span className="model-loading" aria-label="Завантаження 3D-моделі"><Box /></span>;
  return createElement('model-viewer', {
    src: assetUrl(exhibit.model), poster: assetUrl(exhibit.poster), alt: `3D-модель: ${exhibit.title}`,
    loading: 'eager', reveal: 'auto', 'camera-orbit': exhibit.cameraOrbit,
    'camera-controls': interactive || undefined, 'auto-rotate': true,
    'rotation-per-second': interactive ? '12deg' : '8deg', 'shadow-intensity': '1',
    'environment-image': 'neutral', 'interaction-prompt': interactive ? 'auto' : 'none',
    'disable-zoom': interactive ? undefined : true,
    'disable-pan': interactive || undefined,
    'camera-target': 'auto auto auto',
    'min-camera-orbit': interactive ? 'auto auto 5%' : undefined,
    'max-camera-orbit': interactive ? 'auto auto 500%' : undefined,
    style: interactive ? { touchAction: 'none' } : undefined,
    onLoad: interactive ? (event: Event) => {
      const viewer = event.currentTarget as HTMLElement & {
        getBoundingBoxCenter?: () => { x: number; y: number; z: number };
        jumpCameraToGoal?: () => void;
      };
      const center = viewer.getBoundingBoxCenter?.();
      if (!center) return;
      viewer.setAttribute('camera-target', `${center.x}m ${center.y}m ${center.z}m`);
      viewer.jumpCameraToGoal?.();
    } : undefined,
  });
}

export default function Home() {
  const [exhibits, setExhibits] = useState<Exhibit[]>(seedExhibits);
  const [selected, setSelected] = useState<Exhibit | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminReady, setAdminReady] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [pin, setPin] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    apiRequest<Exhibit[]>('/api/exhibits').then(setExhibits).catch(() => {});
    const onFullScreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setNotice('Браузер не дозволив повноекранний режим.'); }
  }
  async function openAdmin() {
    setNotice(''); setPin(''); setLoggedIn(false); setAdminReady(false); edit(); setAdminOpen(true);
    try {
      await apiRequest('/api/logout', { method: 'POST' }).catch(() => {});
      const health = await apiRequest<{ pinReady: boolean }>('/api/health');
      setAdminReady(true); setPinReady(health.pinReady);
    } catch { setAdminReady(false); setLoggedIn(false); }
  }
  async function closeAdmin() {
    await apiRequest('/api/logout', { method: 'POST' }).catch(() => {});
    setLoggedIn(false); setPin(''); setNotice(''); edit(); setAdminOpen(false);
  }
  async function login() {
    setBusy(true); setNotice('');
    try { await apiRequest('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); setLoggedIn(true); setPin(''); }
    catch (error) { setNotice((error as Error).message); setPin(''); }
    finally { setBusy(false); }
  }
  function edit(item?: Exhibit) {
    setEditingId(item?.id || null);
    setForm(item ? { title: item.title, period: item.period, category: item.category, summary: item.summary, model: item.model, poster: item.poster || '' } : blank);
    setModelFile(null); setPosterFile(null); setNotice('');
  }
  async function upload(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const result = await apiRequest<{ url: string }>(`/api/upload?ext=${ext}`, { method: 'PUT', body: file });
    return result.url;
  }
  async function save() {
    if (!form.title.trim() || (!form.model && !modelFile)) { setNotice('Додайте назву і файл GLB.'); return; }
    setBusy(true); setNotice('');
    try {
      const next = { ...form, model: modelFile ? await upload(modelFile) : form.model, poster: posterFile ? await upload(posterFile) : form.poster };
      const item = await apiRequest<Exhibit>(editingId ? `/api/exhibits/${editingId}` : '/api/exhibits', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      setExhibits((items) => editingId ? items.map((old) => old.id === editingId ? item : old) : [...items, item]);
      edit(); setNotice('Збережено. Каталог оновлено.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!editingId || !window.confirm('Видалити цей експонат із каталогу?')) return;
    setBusy(true);
    try {
      await apiRequest(`/api/exhibits/${editingId}`, { method: 'DELETE' });
      setExhibits((items) => items.filter((item) => item.id !== editingId));
      edit(); setNotice('Експонат видалено з каталогу.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  if (adminOpen) return <main className="museum-shell admin-shell">
    <header className="museum-header admin-page-header">
      <span className="museum-brand"><span className="museum-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>МУЗЕЙ КОРЦЯ</strong><small>ПАНЕЛЬ КЕРУВАННЯ</small></span></span>
      <div className="header-actions"><span className="admin-status">{loggedIn ? 'ДОСТУП ВІДКРИТО' : 'ЗАХИЩЕНО PIN-КОДОМ'}</span><Button variant="ghost" size="icon-lg" className="header-icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Вийти з повноекранного режиму' : 'Відкрити на весь екран'}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button></div>
    </header>
    <section className="admin-page">
      <div className="admin-page-heading"><p className="eyebrow">ДЛЯ ПРАЦІВНИКІВ МУЗЕЮ</p><h1>{loggedIn ? 'Керування колекцією' : 'Вхід до панелі'}</h1><p>{loggedIn ? 'Додавайте експонати та оновлюйте інформацію. Зміни зберігаються лише на цьому комп’ютері.' : 'Введіть шестизначний PIN-код, щоб продовжити.'}</p></div>
      <div className="admin-page-content">
        {!adminReady ? <div className="admin-state-card"><Box /><strong>Сховище недоступне</strong><p>Запустіть сайт через музейний ярлик запуску.</p></div>
        : !pinReady ? <div className="admin-state-card"><Settings2 /><strong>PIN ще не створено</strong><p>Адміністратор має один раз запустити файл «Setup-Admin-PIN.bat» на цьому комп’ютері.</p></div>
        : !loggedIn ? <div className="pin-panel"><div className="pin-dots" aria-label={`${pin.length} цифр введено`}>{'●'.repeat(pin.length)}{'○'.repeat(6 - pin.length)}</div><div className="pin-grid">{['1','2','3','4','5','6','7','8','9','⌫','0','Увійти'].map((key) => <button key={key} type="button" disabled={busy} onClick={() => key === '⌫' ? setPin(pin.slice(0, -1)) : key === 'Увійти' ? login() : pin.length < 6 && setPin(pin + key)}>{key}</button>)}</div>{notice && <p className="admin-notice" role="status">{notice}</p>}</div>
        : <div className="admin-workspace"><aside className="admin-list"><div className="admin-list-top"><div><small>{exhibits.length} у колекції</small><strong>Експонати</strong></div><Button onClick={() => edit()}><Plus /> Додати</Button></div><div className="admin-items">{exhibits.map((item) => <button key={item.id} type="button" className={editingId === item.id ? 'admin-item active' : 'admin-item'} onClick={() => edit(item)}><span>{item.title}<small>{item.category || 'Без категорії'}</small></span><ChevronRight /></button>)}</div></aside><div className="admin-form"><div className="admin-form-title"><div><small>{editingId ? 'ОБРАНИЙ ЕКСПОНАТ' : 'НОВИЙ ЗАПИС'}</small><h2>{editingId ? 'Редагувати експонат' : 'Додати експонат'}</h2></div>{editingId && <Button variant="outline" onClick={remove} disabled={busy}><Trash2 /> Видалити</Button>}</div><label>Назва<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} /></label><div className="admin-form-row"><label>Тип<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={80} placeholder="Наприклад, чашки" /></label><label>Період / підпис<input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} maxLength={120} /></label></div><label>Опис<textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={1200} rows={3} /></label><div className="admin-form-row file-row"><label>3D-модель GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(e) => setModelFile(e.target.files?.[0] || null)} /><small>{modelFile?.name || (form.model ? 'Поточна модель збережеться' : 'Обов’язково')}</small></label><label>Фото обкладинки<input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(e) => setPosterFile(e.target.files?.[0] || null)} /><small>{posterFile?.name || (form.poster ? 'Поточне фото збережеться' : 'Необов’язково')}</small></label></div><div className="admin-form-actions"><Button onClick={save} disabled={busy}>{busy ? 'Зачекайте…' : 'Зберегти зміни'}</Button><span>Торкніться текстового поля, щоб відкрити екранну клавіатуру.</span></div>{notice && <p className="admin-notice" role="status">{notice}</p>}</div></div>}
      </div>
      <footer className="admin-page-footer"><Button className="detail-back admin-back" onClick={closeAdmin}><ArrowLeft /> Повернутися до колекції</Button>{loggedIn && <span>Після виходу PIN потрібно буде ввести знову.</span>}</footer>
    </section>
  </main>;

  if (selected) return <main className="museum-shell detail-shell">
    <header className="museum-header detail-header">
      <span className="museum-brand"><span className="museum-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>МУЗЕЙ КОРЦЯ</strong><small>ЦИФРОВА КОЛЕКЦІЯ</small></span></span>
      <Button variant="ghost" size="icon-lg" className="header-icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Вийти з повноекранного режиму' : 'Відкрити на весь екран'} title={fullscreen ? 'Вийти з повноекранного режиму' : 'На весь екран'}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button>
    </header>
    <section className="exhibit-page">
      <div className="exhibit-information">
        <div>
          <p className="eyebrow">{selected.category} · {selected.period}</p>
          <h1>{selected.title}</h1>
          <p className="exhibit-summary">{selected.summary}</p>
          <div className="touch-instructions"><Hand /><span><strong>Огляд у 3D</strong>Проведіть пальцем, щоб обертати. Розведіть два пальці, щоб наблизити.</span></div>
        </div>
        <Button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft /> Повернутися до колекції</Button>
      </div>
      <div className="detail-model-stage"><ModelPreview exhibit={selected} interactive /><span className="gesture-hint"><Hand /> Обертайте предмет пальцем</span></div>
    </section>
  </main>;

  return <main className="museum-shell catalog-shell">
    <header className="museum-header"><a className="museum-brand" href="#catalog" aria-label="На початок каталогу"><span className="museum-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>МУЗЕЙ КОРЦЯ</strong><small>ЦИФРОВА КОЛЕКЦІЯ</small></span></a><div className="header-actions"><span className="collection-count">{exhibits.length} ЕКСПОНАТІВ</span><Button variant="ghost" size="icon-lg" className="header-icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Вийти з повноекранного режиму' : 'Відкрити на весь екран'} title={fullscreen ? 'Вийти з повноекранного режиму' : 'На весь екран'}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button><Button variant="ghost" size="icon-lg" className="header-icon" onClick={openAdmin} aria-label="Відкрити панель адміністратора" title="Для працівників музею"><Settings2 /></Button></div></header>
    <section className="catalog-intro" id="catalog"><div><p className="eyebrow">КОРЕЦЬКА ПОРЦЕЛЯНА ТА КЕРАМІКА</p><h1>Колекція посуду</h1></div><p className="intro-copy">Оберіть предмет, щоб роздивитися його у 3D.</p></section>
    <section className="exhibit-grid" aria-live="polite">{exhibits.map((exhibit, index) => <button className="exhibit-card" key={exhibit.id} onClick={() => setSelected(exhibit)} type="button"><span className="model-tile"><ModelPreview exhibit={exhibit} /></span><span className="card-copy"><small>{exhibit.category} · {String(index + 1).padStart(2, '0')}</small><strong>{exhibit.title}</strong><span>{exhibit.period}<ChevronRight /></span></span></button>)}</section>
    <footer className="museum-footer"><span>КОРЕЦЬКИЙ ІСТОРИЧНИЙ МУЗЕЙ</span><span className="touch-hint"><Hand /> Торкніться предмета, щоб відкрити 3D</span></footer>
  </main>;
}
