export type Product = {
  id: string
  name: string
  brand: string
  category: string
  store: string
  price: string
  barcode: string
  notes: string
  dateAdded: string
  photos: string[]
}

export const emptyProduct = (): Product => ({
  id: crypto.randomUUID(), name: '', brand: '', category: '', store: '', price: '', barcode: '', notes: '',
  dateAdded: new Date().toISOString(), photos: []
})
