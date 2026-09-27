export type Relationship = 'friend' | 'family' | 'work' | 'other'

export type Person = {
  id: string
  name: string
  relationship: Relationship
  company: string
  tags: string[]
  note: string
  nextFollowUpAt: string
  createdAt: string
  updatedAt: string
}

export type Interaction = {
  id: string
  personId: string
  happenedAt: string
  kind: string
  summary: string
  createdAt: string
}

export type BackupFile = {
  format: 'relationflow-backup'
  version: 1
  exportedAt: string
  people: Person[]
  interactions: Interaction[]
}

export const relationshipLabels: Record<Relationship, string> = {
  friend: '朋友',
  family: '家人',
  work: '同事',
  other: '其他',
}
