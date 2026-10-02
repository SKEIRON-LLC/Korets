'use client';

import { createElement, useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Box, ChevronRight, Hand, Image as ImageIcon, Maximize2, Minimize2, Plus, Quote, Settings2, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import seedExhibits from '@/data/seed-exhibits.json';

type Exhibit = { id: string; title: string; period: string; category: string; summary: string; model: string; poster?: string; cameraOrbit?: string };
type ExhibitDraft = { title: string; period: string; category: string; summary: string; model: string; poster: string };
type BlockType = 'heading' | 'paragraph' | 'quote' | 'image';
type ArticleBlock = { id: string; type: BlockType; text?: string; image?: string; caption?: string };
type ArticleBlockDraft = ArticleBlock & { file?: File };
type Article = { id: string; title: string; subtitle: string; category: string; cover?: string; blocks: ArticleBlock[] };
type ArticleDraft = { title: string; subtitle: string; category: string; cover: string; blocks: ArticleBlockDraft[] };
type CollectionView = 'exhibits' | 'articles';

const blankExhibit: ExhibitDraft = { title: '', period: '', category: '', summary: '', model: '', poster: '' };
const blankArticle = (): ArticleDraft => ({ title: '', subtitle: '', category: '', cover: '', blocks: [] });
const blockId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

function Brand({ admin = false, linked = false }: { admin?: boolean; linked?: boolean }) {
  const content = <><img className="museum-logo" src="/museum-logo.png" alt="" /><span><strong>МУЗЕЙ КОРЦЯ</strong><small>{admin ? 'ПАНЕЛЬ КЕРУВАННЯ' : 'ЦИФРОВА КОЛЕКЦІЯ'}</small></span></>;
  return linked ? <a className="museum-brand" href="#catalog" aria-label="На початок каталогу">{content}</a> : <span className="museum-brand">{content}</span>;
}

function ModelPreview({ exhibit, interactive = false }: { exhibit: Exhibit; interactive?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    import('@google/model-viewer').then(() => active && setReady(true)).catch(() => active && setReady(false));
    return () => { active = false; };
  }, []);
  if (!ready) return exhibit.poster
    ? <img className="model-poster" src={assetUrl(exhibit.poster)} alt={exhibit.title} />
    : <span className="model-loading" aria-label="Завантаження 3D-моделі"><Box /></span>;
  return createElement('model-viewer', {
    src: assetUrl(exhibit.model), poster: assetUrl(exhibit.poster), alt: `3D-модель: ${exhibit.title}`,
    loading: 'eager', reveal: 'auto', 'camera-orbit': exhibit.cameraOrbit,
    'camera-controls': interactive || undefined, 'auto-rotate': true,
    'rotation-per-second': interactive ? '12deg' : '8deg', 'shadow-intensity': '1',
    'environment-image': 'neutral', 'interaction-prompt': interactive ? 'auto' : 'none',
    'disable-zoom': interactive ? undefined : true, 'disable-pan': interactive || undefined,
    'camera-target': 'auto auto auto', 'min-camera-orbit': interactive ? 'auto auto 5%' : undefined,
    'max-camera-orbit': interactive ? 'auto auto 500%' : undefined,
    style: interactive ? { touchAction: 'none' } : undefined,
    onLoad: interactive ? (event: Event) => {
      const viewer = event.currentTarget as HTMLElement & { getBoundingBoxCenter?: () => { x: number; y: number; z: number }; jumpCameraToGoal?: () => void };
      const center = viewer.getBoundingBoxCenter?.();
      if (!center) return;
      viewer.setAttribute('camera-target', `${center.x}m ${center.y}m ${center.z}m`);
      viewer.jumpCameraToGoal?.();
    } : undefined,
  });
}

export default function Home() {
  const [exhibits, setExhibits] = useState<Exhibit[]>(seedExhibits);
  const [articles, setArticles] = useState<Article[]>([]);
  const [collectionView, setCollectionView] = useState<CollectionView>('exhibits');
  const [selected, setSelected] = useState<Exhibit | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminReady, setAdminReady] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [pin, setPin] = useState('');
  const [adminSection, setAdminSection] = useState<CollectionView>('exhibits');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExhibitDraft>(blankExhibit);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleForm, setArticleForm] = useState<ArticleDraft>(blankArticle);
  const [articleCoverFile, setArticleCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    apiRequest<Exhibit[]>('/api/exhibits').then(setExhibits).catch(() => {});
    apiRequest<Article[]>('/api/articles').then(setArticles).catch(() => {});
    const onFullScreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setNotice('Браузер не дозволив повноекранний режим.'); }
  }
  const fullscreenButton = <Button variant="ghost" size="icon-lg" className="header-icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Вийти з повноекранного режиму' : 'Відкрити на весь екран'}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button>;

  async function openAdmin() {
    setNotice(''); setPin(''); setLoggedIn(false); setAdminReady(false); editExhibit(); editArticle(); setAdminOpen(true);
    try {
      await apiRequest('/api/logout', { method: 'POST' }).catch(() => {});
      const health = await apiRequest<{ pinReady: boolean }>('/api/health');
      setAdminReady(true); setPinReady(health.pinReady);
    } catch { setAdminReady(false); setLoggedIn(false); }
  }
  async function closeAdmin() {
    await apiRequest('/api/logout', { method: 'POST' }).catch(() => {});
    setLoggedIn(false); setPin(''); setNotice(''); editExhibit(); editArticle(); setAdminOpen(false);
  }
  async function login() {
    setBusy(true); setNotice('');
    try { await apiRequest('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); setLoggedIn(true); setPin(''); }
    catch (error) { setNotice((error as Error).message); setPin(''); }
    finally { setBusy(false); }
  }
  async function upload(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const result = await apiRequest<{ url: string }>(`/api/upload?ext=${ext}`, { method: 'PUT', body: file });
    return result.url;
  }

  function editExhibit(item?: Exhibit) {
    setEditingId(item?.id || null);
    setForm(item ? { title: item.title, period: item.period, category: item.category, summary: item.summary, model: item.model, poster: item.poster || '' } : blankExhibit);
    setModelFile(null); setPosterFile(null); setNotice('');
  }
  async function saveExhibit() {
    if (!form.title.trim() || (!form.model && !modelFile)) { setNotice('Додайте назву і файл GLB.'); return; }
    setBusy(true); setNotice('');
    try {
      const next = { ...form, model: modelFile ? await upload(modelFile) : form.model, poster: posterFile ? await upload(posterFile) : form.poster };
      const item = await apiRequest<Exhibit>(editingId ? `/api/exhibits/${editingId}` : '/api/exhibits', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      setExhibits((items) => editingId ? items.map((old) => old.id === editingId ? item : old) : [...items, item]);
      editExhibit(); setNotice('Збережено. Каталог оновлено.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function removeExhibit() {
    if (!editingId || !window.confirm('Видалити цей експонат із каталогу?')) return;
    setBusy(true);
    try { await apiRequest(`/api/exhibits/${editingId}`, { method: 'DELETE' }); setExhibits((items) => items.filter((item) => item.id !== editingId)); editExhibit(); setNotice('Експонат видалено.'); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  function editArticle(item?: Article) {
    setEditingArticleId(item?.id || null);
    setArticleForm(item ? { title: item.title, subtitle: item.subtitle, category: item.category, cover: item.cover || '', blocks: item.blocks.map((block) => ({ ...block })) } : blankArticle());
    setArticleCoverFile(null); setNotice('');
  }
  function addBlock(type: BlockType) {
    setArticleForm((current) => ({ ...current, blocks: [...current.blocks, { id: blockId(), type, text: type === 'image' ? undefined : '', image: type === 'image' ? '' : undefined, caption: type === 'image' ? '' : undefined }] }));
  }
  function updateBlock(index: number, patch: Partial<ArticleBlockDraft>) {
    setArticleForm((current) => ({ ...current, blocks: current.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block) }));
  }
  function moveBlock(index: number, direction: -1 | 1) {
    setArticleForm((current) => {
      const next = [...current.blocks]; const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, blocks: next };
    });
  }
  async function saveArticle() {
    if (!articleForm.title.trim()) { setNotice('Додайте назву статті.'); return; }
    setBusy(true); setNotice('');
    try {
      const cover = articleCoverFile ? await upload(articleCoverFile) : articleForm.cover;
      const blocks = await Promise.all(articleForm.blocks.map(async ({ file, ...block }) => block.type === 'image' && file ? { ...block, image: await upload(file) } : block));
      if (blocks.some((block) => block.type === 'image' && !block.image)) { setNotice('Додайте файл до кожного блоку зображення.'); setBusy(false); return; }
      const next = { title: articleForm.title, subtitle: articleForm.subtitle, category: articleForm.category, cover, blocks };
      const item = await apiRequest<Article>(editingArticleId ? `/api/articles/${editingArticleId}` : '/api/articles', { method: editingArticleId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      setArticles((items) => editingArticleId ? items.map((old) => old.id === editingArticleId ? item : old) : [...items, item]);
      editArticle(); setNotice('Статтю збережено та опубліковано.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function removeArticle() {
    if (!editingArticleId || !window.confirm('Видалити цю статтю?')) return;
    setBusy(true);
    try { await apiRequest(`/api/articles/${editingArticleId}`, { method: 'DELETE' }); setArticles((items) => items.filter((item) => item.id !== editingArticleId)); editArticle(); setNotice('Статтю видалено.'); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  function exhibitWorkspace() {
    return <div className="admin-workspace"><aside className="admin-list"><div className="admin-list-top"><div><small>{exhibits.length} у колекції</small><strong>3D-експонати</strong></div><Button onClick={() => editExhibit()}><Plus /> Додати</Button></div><div className="admin-items">{exhibits.map((item) => <button key={item.id} type="button" className={editingId === item.id ? 'admin-item active' : 'admin-item'} onClick={() => editExhibit(item)}><span>{item.title}<small>{item.category || 'Без категорії'}</small></span><ChevronRight /></button>)}</div></aside><div className="admin-form"><div className="admin-form-title"><div><small>{editingId ? 'ОБРАНИЙ ЕКСПОНАТ' : 'НОВИЙ ЗАПИС'}</small><h2>{editingId ? 'Редагувати експонат' : 'Додати експонат'}</h2></div>{editingId && <Button variant="outline" onClick={removeExhibit} disabled={busy}><Trash2 /> Видалити</Button>}</div><label>Назва<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} /></label><div className="admin-form-row"><label>Тип<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} maxLength={80} placeholder="Наприклад, чашки" /></label><label>Період / підпис<input value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} maxLength={120} /></label></div><label>Опис<textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} maxLength={1200} rows={3} /></label><div className="admin-form-row file-row"><label>3D-модель GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => setModelFile(event.target.files?.[0] || null)} /><small>{modelFile?.name || (form.model ? 'Поточна модель збережеться' : 'Обов’язково')}</small></label><label>Фото обкладинки<input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => setPosterFile(event.target.files?.[0] || null)} /><small>{posterFile?.name || (form.poster ? 'Поточне фото збережеться' : 'Необов’язково')}</small></label></div><div className="admin-form-actions"><Button onClick={saveExhibit} disabled={busy}>{busy ? 'Зачекайте…' : 'Зберегти зміни'}</Button><span>Торкніться текстового поля, щоб відкрити екранну клавіатуру.</span></div>{notice && <p className="admin-notice" role="status">{notice}</p>}</div></div>;
  }

  function articleWorkspace() {
    return <div className="admin-workspace article-admin-workspace"><aside className="admin-list"><div className="admin-list-top"><div><small>{articles.length} опубліковано</small><strong>Статті</strong></div><Button onClick={() => editArticle()}><Plus /> Додати</Button></div><div className="admin-items">{articles.length ? articles.map((item) => <button key={item.id} type="button" className={editingArticleId === item.id ? 'admin-item active' : 'admin-item'} onClick={() => editArticle(item)}><span>{item.title}<small>{item.category || 'Без категорії'}</small></span><ChevronRight /></button>) : <p className="admin-empty">Статей ще немає. Створіть першу історію.</p>}</div></aside><div className="admin-form article-editor"><div className="admin-form-title"><div><small>{editingArticleId ? 'ОБРАНА СТАТТЯ' : 'НОВА СТАТТЯ'}</small><h2>{editingArticleId ? 'Редагувати статтю' : 'Створити статтю'}</h2></div>{editingArticleId && <Button variant="outline" onClick={removeArticle} disabled={busy}><Trash2 /> Видалити</Button>}</div><label>Назва<input value={articleForm.title} onChange={(event) => setArticleForm({ ...articleForm, title: event.target.value })} maxLength={160} placeholder="Ім’я людини або назва історії" /></label><div className="admin-form-row"><label>Розділ<input value={articleForm.category} onChange={(event) => setArticleForm({ ...articleForm, category: event.target.value })} maxLength={80} placeholder="Наприклад, Видатні постаті" /></label><label>Головне зображення<input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => setArticleCoverFile(event.target.files?.[0] || null)} /><small>{articleCoverFile?.name || (articleForm.cover ? 'Поточне фото збережеться' : 'Необов’язково')}</small></label></div><label>Короткий вступ<textarea value={articleForm.subtitle} onChange={(event) => setArticleForm({ ...articleForm, subtitle: event.target.value })} maxLength={600} rows={2} placeholder="Короткий текст для картки та початку сторінки" /></label><div className="block-editor-heading"><div><small>ВМІСТ СТАТТІ</small><strong>Блоки сторінки</strong></div><div className="block-add-buttons"><button type="button" onClick={() => addBlock('heading')}><Type /> Заголовок</button><button type="button" onClick={() => addBlock('paragraph')}><BookOpen /> Текст</button><button type="button" onClick={() => addBlock('image')}><ImageIcon /> Фото</button><button type="button" onClick={() => addBlock('quote')}><Quote /> Цитата</button></div></div><div className="article-block-list">{articleForm.blocks.length ? articleForm.blocks.map((block, index) => <div className="article-block-editor" key={block.id}><div className="article-block-toolbar"><strong>{({ heading: 'Заголовок', paragraph: 'Текст', image: 'Зображення', quote: 'Цитата' } as Record<BlockType, string>)[block.type]}</strong><span><button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label="Перемістити вище"><ArrowUp /></button><button type="button" onClick={() => moveBlock(index, 1)} disabled={index === articleForm.blocks.length - 1} aria-label="Перемістити нижче"><ArrowDown /></button><button type="button" onClick={() => setArticleForm((current) => ({ ...current, blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index) }))} aria-label="Видалити блок"><Trash2 /></button></span></div>{block.type === 'image' ? <div className="image-block-fields"><label>Файл<input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => updateBlock(index, { file: event.target.files?.[0] || undefined })} /><small>{block.file?.name || (block.image ? 'Поточне зображення збережеться' : 'Оберіть зображення')}</small></label><label>Підпис<input value={block.caption || ''} onChange={(event) => updateBlock(index, { caption: event.target.value })} maxLength={400} /></label></div> : <textarea value={block.text || ''} onChange={(event) => updateBlock(index, { text: event.target.value })} rows={block.type === 'paragraph' ? 5 : 2} maxLength={block.type === 'paragraph' ? 6000 : block.type === 'quote' ? 1800 : 240} placeholder={block.type === 'heading' ? 'Назва розділу' : block.type === 'quote' ? 'Текст цитати' : 'Текст абзацу'} />}</div>) : <div className="blocks-empty"><BookOpen /><p>Додайте заголовок, текст, фото або цитату.</p></div>}</div><div className="admin-form-actions"><Button onClick={saveArticle} disabled={busy}>{busy ? 'Зачекайте…' : 'Зберегти й опублікувати'}</Button><span>Блоки можна пересувати стрілками та редагувати у будь-який час.</span></div>{notice && <p className="admin-notice" role="status">{notice}</p>}</div></div>;
  }

  if (adminOpen) return <main className="museum-shell admin-shell">
    <header className="museum-header admin-page-header"><Brand admin /><div className="header-actions"><span className="admin-status">{loggedIn ? 'ДОСТУП ВІДКРИТО' : 'ЗАХИЩЕНО PIN-КОДОМ'}</span>{fullscreenButton}</div></header>
    <section className={`admin-page ${!loggedIn ? 'admin-login-page' : ''}`}>
      <div className="admin-page-heading"><p className="eyebrow">ДЛЯ ПРАЦІВНИКІВ МУЗЕЮ</p><h1>{loggedIn ? 'Керування колекцією' : 'Вхід до панелі'}</h1><p>{loggedIn ? 'Редагуйте 3D-експонати та текстові історії. Усі зміни зберігаються лише на цьому комп’ютері.' : 'Введіть шестизначний PIN-код, щоб продовжити.'}</p></div>
      <div className="admin-page-content">
        {!adminReady ? <div className="admin-state-card"><Box /><strong>Сховище недоступне</strong><p>Запустіть сайт через музейний ярлик запуску.</p></div>
        : !pinReady ? <div className="admin-state-card"><Settings2 /><strong>PIN ще не створено</strong><p>Адміністратор має один раз запустити файл «Setup-Admin-PIN.bat».</p></div>
        : !loggedIn ? <div className="pin-panel"><div className="pin-dots" aria-label={`${pin.length} цифр введено`}>{'●'.repeat(pin.length)}{'○'.repeat(6 - pin.length)}</div><div className="pin-grid">{['1','2','3','4','5','6','7','8','9','⌫','0','Увійти'].map((key) => <button key={key} type="button" disabled={busy} onClick={() => key === '⌫' ? setPin(pin.slice(0, -1)) : key === 'Увійти' ? login() : pin.length < 6 && setPin(pin + key)}>{key}</button>)}</div>{notice && <p className="admin-notice" role="status">{notice}</p>}</div>
        : <div className="admin-authenticated"><nav className="admin-tabs" aria-label="Розділ панелі"><button className={adminSection === 'exhibits' ? 'active' : ''} onClick={() => { setAdminSection('exhibits'); setNotice(''); }}><Box /> 3D-експонати</button><button className={adminSection === 'articles' ? 'active' : ''} onClick={() => { setAdminSection('articles'); setNotice(''); }}><BookOpen /> Статті та люди</button></nav>{adminSection === 'exhibits' ? exhibitWorkspace() : articleWorkspace()}</div>}
      </div>
      <footer className="admin-page-footer"><Button className="detail-back admin-back" onClick={closeAdmin}><ArrowLeft /> Повернутися до колекції</Button>{loggedIn && <span>Після виходу PIN потрібно буде ввести знову.</span>}</footer>
    </section>
  </main>;

  if (selected) return <main className="museum-shell detail-shell"><header className="museum-header detail-header"><Brand />{fullscreenButton}</header><section className="exhibit-page"><div className="exhibit-information"><div><p className="eyebrow">{selected.category} · {selected.period}</p><h1>{selected.title}</h1><p className="exhibit-summary">{selected.summary}</p><div className="touch-instructions"><Hand /><span><strong>Огляд у 3D</strong>Проведіть пальцем, щоб обертати. Розведіть два пальці, щоб наблизити.</span></div></div><Button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft /> Повернутися до колекції</Button></div><div className="detail-model-stage"><ModelPreview exhibit={selected} interactive /><span className="gesture-hint"><Hand /> Обертайте предмет пальцем</span></div></section></main>;

  if (selectedArticle) return <main className="museum-shell article-shell"><header className="museum-header detail-header"><Brand />{fullscreenButton}</header><section className="article-page"><aside className="article-profile">{selectedArticle.cover ? <img src={assetUrl(selectedArticle.cover)} alt={selectedArticle.title} /> : <div className="article-cover-placeholder"><BookOpen /></div>}<div className="article-profile-copy"><p className="eyebrow">{selectedArticle.category || 'ЛЮДИ ТА ІСТОРІЇ'}</p><h1>{selectedArticle.title}</h1>{selectedArticle.subtitle && <p>{selectedArticle.subtitle}</p>}</div><Button className="detail-back" onClick={() => setSelectedArticle(null)}><ArrowLeft /> Повернутися до історій</Button></aside><article className="article-content">{selectedArticle.blocks.length ? selectedArticle.blocks.map((block) => block.type === 'heading' ? <h2 key={block.id}>{block.text}</h2> : block.type === 'paragraph' ? <p key={block.id}>{block.text}</p> : block.type === 'quote' ? <blockquote key={block.id}>{block.text}</blockquote> : <figure key={block.id}><img src={assetUrl(block.image)} alt={block.caption || selectedArticle.title} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>) : <p className="article-empty-copy">Матеріал цієї сторінки ще готується.</p>}</article></section></main>;

  const showingArticles = collectionView === 'articles';
  return <main className="museum-shell catalog-shell"><header className="museum-header"><Brand linked /><div className="header-actions"><span className="collection-count">{showingArticles ? articles.length : exhibits.length} {showingArticles ? 'ІСТОРІЙ' : 'ЕКСПОНАТІВ'}</span>{fullscreenButton}<Button variant="ghost" size="icon-lg" className="header-icon" onClick={openAdmin} aria-label="Відкрити панель адміністратора"><Settings2 /></Button></div></header><section className="catalog-intro" id="catalog"><div><p className="eyebrow">{showingArticles ? 'ЛЮДИ, ПОДІЇ ТА ІСТОРІЯ КОРЦЯ' : 'КОРЕЦЬКА ПОРЦЕЛЯНА ТА КЕРАМІКА'}</p><h1>{showingArticles ? 'Люди та історії' : 'Колекція посуду'}</h1></div><nav className="catalog-tabs" aria-label="Розділи колекції"><button className={!showingArticles ? 'active' : ''} onClick={() => setCollectionView('exhibits')}><Box /> 3D-колекція</button><button className={showingArticles ? 'active' : ''} onClick={() => setCollectionView('articles')}><BookOpen /> Люди та історії</button></nav></section>{showingArticles ? <section className="exhibit-grid article-grid" aria-live="polite">{articles.length ? articles.map((article, index) => <button className="exhibit-card article-card" key={article.id} onClick={() => setSelectedArticle(article)} type="button"><span className="model-tile article-tile">{article.cover ? <img src={assetUrl(article.cover)} alt="" /> : <BookOpen />}</span><span className="card-copy"><small>{article.category || 'ІСТОРІЯ'} · {String(index + 1).padStart(2, '0')}</small><strong>{article.title}</strong><span>{article.subtitle || 'Відкрити матеріал'}<ChevronRight /></span></span></button>) : <div className="empty-collection"><BookOpen /><h2>Історії ще готуються</h2><p>Працівники музею можуть додати першу статтю через панель керування.</p></div>}</section> : <section className="exhibit-grid" aria-live="polite">{exhibits.map((exhibit, index) => <button className="exhibit-card" key={exhibit.id} onClick={() => setSelected(exhibit)} type="button"><span className="model-tile"><ModelPreview exhibit={exhibit} /></span><span className="card-copy"><small>{exhibit.category} · {String(index + 1).padStart(2, '0')}</small><strong>{exhibit.title}</strong><span>{exhibit.period}<ChevronRight /></span></span></button>)}</section>}<footer className="museum-footer"><span>КОРЕЦЬКИЙ ІСТОРИЧНИЙ МУЗЕЙ</span><span className="touch-hint"><Hand /> {showingArticles ? 'Торкніться картки, щоб прочитати' : 'Торкніться предмета, щоб відкрити 3D'}</span></footer></main>;
}
