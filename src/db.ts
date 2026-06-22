import type { Product } from './types'

const DB = 'keep-product-archive'
const STORE = 'products'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getProducts(): Promise<Product[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)))
    request.onerror = () => reject(request.error)
  })
}

export async function putProduct(product: Product) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(product)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deleteProduct(id: string) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
