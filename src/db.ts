import type { Product } from './types'

const DB = 'keep-product-archive'
const STORE = 'products'
const SETTINGS = 'settings'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(SETTINGS)) request.result.createObjectStore(SETTINGS, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getCategories(): Promise<string[] | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS).objectStore(SETTINGS).get('categories')
    request.onsuccess = () => resolve(request.result?.value || null)
    request.onerror = () => reject(request.error)
  })
}

export async function putCategories(categories: string[]) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(SETTINGS, 'readwrite').objectStore(SETTINGS).put({ key: 'categories', value: categories })
    request.onsuccess = () => resolve()
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
