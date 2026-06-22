import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { deleteProduct, getProducts, putProduct } from './db'
import { emptyProduct, type Product } from './types'

type View = 'archive' | 'add' | 'settings'

const categories = ['Food & drink', 'Home', 'Electronics', 'Beauty', 'Automotive', 'Other']

function formatDate(date: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date)) }

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [view, setView] = useState<View>('archive')
  const [draft, setDraft] = useState<Product>(emptyProduct)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [detail, setDetail] = useState<Product | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [message, setMessage] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)

  useEffect(() => { getProducts().then(setProducts) }, [])
  useEffect(() => () => stopCamera(), [])
  useEffect(() => {
    if (!scannerOpen || !video.current || !stream.current) return
    video.current.srcObject = stream.current
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 180 })
    let controls: { stop: () => void } | undefined
    reader.decodeFromVideoElement(video.current, (result) => {
      if (result) { update('barcode', result.getText()); controls?.stop(); stopCamera() }
    }).then(found => { controls = found }).catch(() => setMessage('Could not start the scanner. You can type the barcode below.'))
    return () => controls?.stop()
  }, [scannerOpen])

  const result = useMemo(() => products.filter(p => {
    const haystack = [p.name, p.brand, p.category, p.store, p.barcode, p.notes].join(' ').toLowerCase()
    return haystack.includes(query.toLowerCase()) && (filter === 'All' || p.category === filter)
  }), [products, query, filter])

  function update(field: keyof Product, value: string) { setDraft(current => ({ ...current, [field]: value })) }
  function beginAdd() { setDraft(emptyProduct()); setView('add') }
  async function save() {
    if (!draft.name.trim() && !draft.barcode.trim() && !draft.photos.length) { setMessage('Add a product name, barcode, or photo first.'); return }
    const existing = draft.barcode && products.find(p => p.barcode === draft.barcode && p.id !== draft.id)
    if (existing && !confirm(`This barcode is already saved as “${existing.name || 'Untitled product'}”. Save another entry anyway?`)) return
    const ready = { ...draft, name: draft.name.trim() || 'Untitled product' }
    await putProduct(ready); setProducts(await getProducts()); setView('archive'); setMessage('Saved to this device.'); window.setTimeout(() => setMessage(''), 3000)
  }
  async function remove(id: string) { if (confirm('Delete this product from your archive?')) { await deleteProduct(id); setProducts(await getProducts()); setDetail(null) } }
  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    Promise.all(files.map(file => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file) }))).then(photos => setDraft(d => ({ ...d, photos: [...d.photos, ...photos] })))
  }
  async function startCamera() {
    try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); setScannerOpen(true) }
    catch { setMessage('Camera access was unavailable. You can enter the barcode manually.') }
  }
  function stopCamera() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setScannerOpen(false) }
  function captureBarcode() {
    const barcode = prompt('Enter the barcode shown in the camera view:')
    if (barcode) update('barcode', barcode.trim())
    stopCamera()
  }

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('archive')} aria-label="Go to archive"><span>⌑</span> keep</button><button className="icon-button" onClick={() => setView('settings')} aria-label="Settings">⚙</button></header>
    {message && <div className="toast">{message}</div>}
    {view === 'archive' && <section className="screen">
      <div className="hero"><p className="eyebrow">PERSONAL PRODUCT ARCHIVE</p><h1>Remember the good stuff.</h1><p>Snap it now. Find it when you need it.</p><button className="primary wide" onClick={beginAdd}><span>＋</span> Add product</button></div>
      <div className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your archive" /></div>
      <div className="chips"><button className={filter === 'All' ? 'chip active' : 'chip'} onClick={() => setFilter('All')}>All <small>{products.length}</small></button>{categories.filter(c => products.some(p => p.category === c)).map(c => <button key={c} className={filter === c ? 'chip active' : 'chip'} onClick={() => setFilter(c)}>{c}</button>)}</div>
      <div className="section-title"><h2>{query || filter !== 'All' ? 'Results' : 'Recently added'}</h2><span>{result.length} item{result.length === 1 ? '' : 's'}</span></div>
      {result.length ? <div className="grid">{result.map(product => <button className="card" key={product.id} onClick={() => setDetail(product)}><div className="card-image">{product.photos[0] ? <img src={product.photos[0]} alt="" /> : <span>⌑</span>}</div><div className="card-copy"><b>{product.name}</b><span>{product.brand || product.category || 'Uncategorized'}</span><small>{formatDate(product.dateAdded)}</small></div></button>)}</div> : <div className="empty"><span>⌑</span><h3>Your archive is waiting.</h3><p>Add the things you want to remember—from pantry favorites to that perfect paint color.</p></div>}
    </section>}
    {view === 'add' && <section className="screen form-screen"><div className="back-row"><button className="text-button" onClick={() => setView('archive')}>‹ Back</button><b>New product</b><button className="save-top" onClick={save}>Save</button></div><div className="quick-actions"><button onClick={startCamera}><span>▥</span> Scan barcode</button><label><input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} /><span>◉</span> Take photo</label></div>
      <div className="field"><label>Product name</label><input autoFocus value={draft.name} onChange={e => update('name', e.target.value)} placeholder="What did you find?" /></div>
      <div className="split"><div className="field"><label>Brand</label><input value={draft.brand} onChange={e => update('brand', e.target.value)} placeholder="Optional" /></div><div className="field"><label>Category</label><select value={draft.category} onChange={e => update('category', e.target.value)}><option value="">Select</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div></div>
      <div className="field barcode-field"><label>Barcode</label><input inputMode="numeric" value={draft.barcode} onChange={e => update('barcode', e.target.value)} placeholder="Scan or type barcode" /><button onClick={startCamera}>Scan</button></div>
      <div className="split"><div className="field"><label>Store</label><input value={draft.store} onChange={e => update('store', e.target.value)} placeholder="Optional" /></div><div className="field"><label>Price</label><input inputMode="decimal" value={draft.price} onChange={e => update('price', e.target.value)} placeholder="$0.00" /></div></div>
      <div className="field"><label>Notes</label><textarea value={draft.notes} onChange={e => update('notes', e.target.value)} placeholder="Why is this worth remembering?" /></div>
      {draft.photos.length > 0 && <div className="photo-strip">{draft.photos.map((photo, i) => <div key={photo} className="draft-photo"><img src={photo} alt={`Product ${i + 1}`} /><button onClick={() => setDraft(d => ({ ...d, photos: d.photos.filter((_, index) => index !== i) }))}>×</button></div>)}</div>}
      <button className="primary wide save-bottom" onClick={save}>Save product</button>
    </section>}
    {view === 'settings' && <section className="screen settings"><div className="back-row"><button className="text-button" onClick={() => setView('archive')}>‹ Back</button><b>Settings</b><span /></div><h1>Your archive</h1><div className="setting-card"><span className="sync-icon">↗</span><div><b>GitHub sync</b><p>Coming next: connect your repository to back up products and photos across devices.</p></div><span className="status">LOCAL ONLY</span></div><div className="setting-card"><span className="sync-icon">◌</span><div><b>Offline storage</b><p>{products.length} product{products.length === 1 ? '' : 's'} securely stored on this device.</p></div></div><p className="fine-print">Keep works offline. Install it from your browser’s Share or menu button for an app-like experience.</p></section>}
    {scannerOpen && <div className="modal"><div className="scanner"><button className="close" onClick={stopCamera}>×</button><video ref={video} autoPlay playsInline /><div className="scan-line" /><h2>Point at the barcode</h2><p>Tap below if it isn’t detected automatically.</p><button className="primary" onClick={captureBarcode}>Enter barcode</button></div></div>}
    {detail && <div className="modal"><article className="detail"><button className="close" onClick={() => setDetail(null)}>×</button><div className="detail-image">{detail.photos[0] ? <img src={detail.photos[0]} alt="" /> : <span>⌑</span>}</div><p className="eyebrow">{detail.category || 'PRODUCT'}</p><h1>{detail.name}</h1>{detail.brand && <p className="brand-line">{detail.brand}</p>}<dl>{detail.store && <><dt>Store</dt><dd>{detail.store}</dd></>}{detail.price && <><dt>Price</dt><dd>${detail.price}</dd></>}{detail.barcode && <><dt>Barcode</dt><dd>{detail.barcode}</dd></>}{detail.notes && <><dt>Notes</dt><dd>{detail.notes}</dd></>}</dl><button className="delete" onClick={() => remove(detail.id)}>Delete product</button></article></div>}
  </main>
}
