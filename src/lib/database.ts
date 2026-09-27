import type { BackupFile, Interaction, Person } from '../types'

const DB_NAME = 'relationflow-personal'
const DB_VERSION = 1
const PEOPLE_STORE = 'people'
const INTERACTIONS_STORE = 'interactions'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PEOPLE_STORE)) {
        const people = database.createObjectStore(PEOPLE_STORE, { keyPath: 'id' })
        people.createIndex('by-name', 'name')
        people.createIndex('by-follow-up', 'nextFollowUpAt')
      }
      if (!database.objectStoreNames.contains(INTERACTIONS_STORE)) {
        const interactions = database.createObjectStore(INTERACTIONS_STORE, { keyPath: 'id' })
        interactions.createIndex('by-person', 'personId')
        interactions.createIndex('by-date', 'happenedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
    request.onblocked = () => reject(new Error('数据库正在被其他标签页升级，请关闭其他页面后重试'))
  })
}

async function withStore<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode)
    let result: T | undefined
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('本地数据操作失败'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('本地数据操作已取消'))
    }
    const request = action(transaction)
    if (request) {
      request.onsuccess = () => { result = request.result as T }
      request.onerror = () => { reject(request.error ?? new Error('本地数据操作失败')) }
    }
  })
}

export const database = {
  async getPeople(): Promise<Person[]> {
    return (await withStore<Person[]>(PEOPLE_STORE, 'readonly', (tx) => tx.objectStore(PEOPLE_STORE).getAll())) ?? []
  },
  async savePerson(person: Person): Promise<void> {
    await withStore(PEOPLE_STORE, 'readwrite', (tx) => tx.objectStore(PEOPLE_STORE).put(person))
  },
  async deletePerson(personId: string): Promise<void> {
    await withStore([PEOPLE_STORE, INTERACTIONS_STORE], 'readwrite', (tx) => {
      tx.objectStore(PEOPLE_STORE).delete(personId)
      const related = tx.objectStore(INTERACTIONS_STORE).index('by-person').openCursor(IDBKeyRange.only(personId))
      related.onsuccess = () => {
        const cursor = related.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
    })
  },
  async getInteractions(): Promise<Interaction[]> {
    return (await withStore<Interaction[]>(INTERACTIONS_STORE, 'readonly', (tx) => tx.objectStore(INTERACTIONS_STORE).getAll())) ?? []
  },
  async saveInteraction(interaction: Interaction): Promise<void> {
    await withStore(INTERACTIONS_STORE, 'readwrite', (tx) => tx.objectStore(INTERACTIONS_STORE).put(interaction))
  },
  async exportAll(): Promise<BackupFile> {
    const [people, interactions] = await Promise.all([this.getPeople(), this.getInteractions()])
    return { format: 'relationflow-backup', version: 1, exportedAt: new Date().toISOString(), people, interactions }
  },
  async importAll(backup: BackupFile, replace: boolean): Promise<void> {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([PEOPLE_STORE, INTERACTIONS_STORE], 'readwrite')
      const people = transaction.objectStore(PEOPLE_STORE)
      const interactions = transaction.objectStore(INTERACTIONS_STORE)
      if (replace) {
        people.clear()
        interactions.clear()
      }
      backup.people.forEach((person) => people.put(person))
      backup.interactions.forEach((interaction) => interactions.put(interaction))
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('恢复备份失败')) }
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('恢复备份已取消')) }
    })
  },
  async clearAll(): Promise<void> {
    await withStore([PEOPLE_STORE, INTERACTIONS_STORE], 'readwrite', (tx) => {
      tx.objectStore(PEOPLE_STORE).clear()
      tx.objectStore(INTERACTIONS_STORE).clear()
    })
  },
}

export function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
