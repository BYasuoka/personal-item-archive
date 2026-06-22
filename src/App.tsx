import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { deleteProduct, getProducts, putProduct } from './db'
import { emptyProduct, type Product } from './types'

type View = 'archive' | 'add' | 'settings'

const categories = ['Food & drink', 'Books', 'Home', 'Electronics', 'Beauty', 'Automotive', 'Other']

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
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'empty' | 'error'>('idle')
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
      if (result) { const barcode = result.getText(); update('barcode', barcode); lookupBarcode(barcode); controls?.stop(); stopCamera() }
    }).then(found => { controls = found }).catch(() => setMessage('Could not start the scanner. You can type the barcode below.'))
    return () => controls?.stop()
  }, [scannerOpen])

  const result = useMemo(() => products.filter(p => {
    const haystack = [p.name, p.brand, p.category, p.store, p.barcode, p.notes].join(' ').toLowerCase()
    return haystack.includes(query.toLowerCase()) && (filter === 'All' || p.category === filter)
  }), [products, query, filter])

  function update(field: keyof Product, value: string) { setDraft(current => ({ ...current, [field]: value })) }
  function beginAdd() { setDraft(emptyProduct()); setLookupState('idle'); setView('add') }
  function beginEdit(product: Product) { setDraft({ ...product, photos: [...product.photos] }); setLookupState('idle'); setDetail(null); setView('add') }

  function applyLookup(data: Partial<Product>) {
    setDraft(current => ({
      ...current,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== '')),
      photos: current.photos.length ? current.photos : (data.photos || []),
    }))
    setLookupState('found')
  }

  async function lookupBarcode(rawBarcode = draft.barcode) {
    const barcode = rawBarcode.replace(/[^0-9Xx]/g, '')
    if (!barcode) { setMessage('Scan or enter a barcode first.'); return }
    setLookupState('loading')
    try {
      if (/^(97[89])\d{10}$/.test(barcode) || /^(\d{9}[\dXx])$/.test(barcode)) {
        const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${barcode}&format=json&jscmd=data`)
        const books = await response.json() as Record<string, { title?: string; authors?: Array<{ name: string }>; publishers?: Array<{ name: string }>; cover?: { medium?: string } }>
        const book = Object.values(books)[0]
        if (book?.title) {
          const authors = book.authors?.map(author => author.name).join(', ') || ''
          const publisher = book.publishers?.map(item => item.name).join(', ') || ''
          applyLookup({ name: book.title, brand: authors, category: 'Books', notes: [authors && `Author: ${authors}`, publisher && `Publisher: ${publisher}`].filter(Boolean).join('\n'), photos: book.cover?.medium ? [book.cover.medium] : [] })
          return
        }
      }

      const foodResponse = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
      const food = await foodResponse.json() as { status?: number; product?: { product_name?: string; brands?: string; categories?: string; image_front_url?: string; quantity?: string; nutriments?: Record<string, unknown> } }
      if (food.status === 1 && food.product?.product_name) {
        const nutrition = food.product.nutriments?.['nutrition-score-fr']
        applyLookup({ name: food.product.product_name, brand: food.product.brands || '', category: 'Food & drink', notes: [food.product.categories, food.product.quantity, nutrition !== undefined && `Nutrition score: ${nutrition}`].filter(Boolean).join('\n'), photos: food.product.image_front_url ? [food.product.image_front_url] : [] })
        return
      }

      const productResponse = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`)
      const productResult = await productResponse.json() as { items?: Array<{ title?: string; brand?: string; category?: string; description?: string; images?: string[] }> }
      const product = productResult.items?.[0]
      if (product?.title) {
        applyLookup({ name: product.title, brand: product.brand || '', category: categories.includes(product.category || '') ? product.category! : 'Other', notes: product.description || '', photos: product.images?.slice(0, 1) || [] })
        return
      }
      setLookupState('empty')
    } catch {
      setLookupState('error')
      setMessage('Could not look up that barcode. You can still save it manually.')
    }
  }
  async function save() {
    if (!draft.name.trim() && !draft.barcode.trim() && !draft.photos.length) { setMessage('Add a product name, barcode, or photo first.'); return }
    const existing = draft.barcode && products.find(p => p.barcode === draft.barcode && p.id !== draft.id)
    if (existing && !confirm(`This barcode is already saved as “${existing.name || 'Untitled product'}”. Save another entry anyway?`)) return
    const ready = { ...draft, name: draft.name.trim() || 'Untitled product' }
    const isEdit = products.some(product => product.id === ready.id)
    await putProduct(ready); setProducts(await getProducts()); setView('archive'); setMessage(isEdit ? 'Product updated.' : 'Saved to this device.'); window.setTimeout(() => setMessage(''), 3000)
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
    if (barcode) { const value = barcode.trim(); update('barcode', value); lookupBarcode(value) }
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
    {view === 'add' && <section className="screen form-screen"><div className="back-row"><button className="text-button" onClick={() => setView('archive')}>‹ Back</button><b>{products.some(product => product.id === draft.id) ? 'Edit product' : 'New product'}</b><button className="save-top" onClick={save}>Save</button></div><div className="quick-actions"><button onClick={startCamera}><span>▥</span> Scan barcode</button><label><input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} /><span>◉</span> Take photo</label></div>
      <div className="field"><label>Product name</label><input autoFocus value={draft.name} onChange={e => update('name', e.target.value)} placeholder="What did you find?" /></div>
      <div className="split"><div className="field"><label>Brand</label><input value={draft.brand} onChange={e => update('brand', e.target.value)} placeholder="Optional" /></div><div className="field"><label>Category</label><select value={draft.category} onChange={e => update('category', e.target.value)}><option value="">Select</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div></div>
      <div className="field barcode-field"><label>Barcode</label><input inputMode="numeric" value={draft.barcode} onChange={e => { update('barcode', e.target.value); setLookupState('idle') }} onBlur={() => lookupBarcode()} placeholder="Scan or type barcode" /><button onClick={startCamera}>Scan</button></div>
      <div className={`lookup-state ${lookupState}`}>{lookupState === 'loading' && 'Looking up product information…'}{lookupState === 'found' && 'Product details added — review and edit anything you like.'}{lookupState === 'empty' && 'No matching product found. Add details manually.'}{lookupState === 'error' && 'Lookup unavailable. Add details manually or try again later.'}</div>
      <div className="split"><div className="field"><label>Store</label><input value={draft.store} onChange={e => update('store', e.target.value)} placeholder="Optional" /></div><div className="field"><label>Price</label><input inputMode="decimal" value={draft.price} onChange={e => update('price', e.target.value)} placeholder="$0.00" /></div></div>
      <div className="field"><label>Notes</label><textarea value={draft.notes} onChange={e => update('notes', e.target.value)} placeholder="Why is this worth remembering?" /></div>
      {draft.photos.length > 0 && <div className="photo-strip">{draft.photos.map((photo, i) => <div key={photo} className="draft-photo"><img src={photo} alt={`Product ${i + 1}`} /><button onClick={() => setDraft(d => ({ ...d, photos: d.photos.filter((_, index) => index !== i) }))}>×</button></div>)}</div>}
      <button className="primary wide save-bottom" onClick={save}>{products.some(product => product.id === draft.id) ? 'Save changes' : 'Save product'}</button>
    </section>}
    {view === 'settings' && <section className="screen settings"><div className="back-row"><button className="text-button" onClick={() => setView('archive')}>‹ Back</button><b>Settings</b><span /></div><h1>Your archive</h1><div className="setting-card"><span className="sync-icon">↗</span><div><b>GitHub sync</b><p>Coming next: connect your repository to back up products and photos across devices.</p></div><span className="status">LOCAL ONLY</span></div><div className="setting-card"><span className="sync-icon">◌</span><div><b>Offline storage</b><p>{products.length} product{products.length === 1 ? '' : 's'} securely stored on this device.</p></div></div><p className="fine-print">Keep works offline. Install it from your browser’s Share or menu button for an app-like experience.</p></section>}
    {scannerOpen && <div className="modal"><div className="scanner"><button className="close" onClick={stopCamera}>×</button><div className="scanner-view"><video ref={video} autoPlay playsInline /><div className="scan-frame"><div className="scan-line" /></div></div><h2>Point at the barcode</h2><p>Place the bars inside the box, with the numbers on the line.</p><button className="primary" onClick={captureBarcode}>Enter barcode</button></div></div>}
    {detail && <div className="modal"><article className="detail"><button className="close" onClick={() => setDetail(null)}>×</button><div className="detail-image">{detail.photos[0] ? <img src={detail.photos[0]} alt="" /> : <span>⌑</span>}</div><p className="eyebrow">{detail.category || 'PRODUCT'}</p><h1>{detail.name}</h1>{detail.brand && <p className="brand-line">{detail.brand}</p>}<dl>{detail.store && <><dt>Store</dt><dd>{detail.store}</dd></>}{detail.price && <><dt>Price</dt><dd>${detail.price}</dd></>}{detail.barcode && <><dt>Barcode</dt><dd>{detail.barcode}</dd></>}{detail.notes && <><dt>Notes</dt><dd>{detail.notes}</dd></>}</dl><div className="detail-actions"><button className="edit" onClick={() => beginEdit(detail)}>Edit product</button><button className="delete" onClick={() => remove(detail.id)}>Delete product</button></div></article></div>}
  </main>
}
