import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createId, database } from './lib/database'
import { relationshipLabels, type BackupFile, type Interaction, type Person, type Relationship } from './types'

type Route = { page: 'home' | 'people' | 'settings' | 'person'; personId?: string }
type Notice = { message: string; tone: 'success' | 'error' }
type PersonFields = Pick<Person, 'name' | 'relationship' | 'company' | 'tags' | 'note' | 'nextFollowUpAt'>
type InteractionFields = Pick<Interaction, 'happenedAt' | 'kind' | 'summary'>

const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const shortDate = (date: string) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
const timestamp = (date: string) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${date.slice(0, 10)}T00:00:00`))
const relationshipColor: Record<Relationship, string> = { friend: 'sage', family: 'rose', work: 'blue', other: 'amber' }

function routeFromHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'people' && parts[1]) return { page: 'person', personId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'people') return { page: 'people' }
  if (parts[0] === 'settings') return { page: 'settings' }
  return { page: 'home' }
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.6-.3.1a7.7 7.7 0 0 1-1.6.9l-.2.2-.3 1.7h-3l-.3-1.7-.2-.2a7.7 7.7 0 0 1-1.6-.9l-.3-.1-1.7.6-1.5-2.6 1.4-1.1.1-.3a7.2 7.2 0 0 1 0-1.8l-.1-.3-1.4-1.1 1.5-2.6 1.7.6.3-.1a7.7 7.7 0 0 1 1.6-.9l.2-.2.3-1.7h3l.3 1.7.2.2a7.7 7.7 0 0 1 1.6.9l.3.1 1.7-.6 1.5 2.6-1.4 1.1-.1.3a7.2 7.2 0 0 1 0 1.8Z" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    back: <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>,
    heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.note}</svg>
}

function initials(name: string) {
  return name.trim().slice(0, 1) || '友'
}

function friendlyDate(date: string) {
  const delta = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000)
  if (delta < 0) return `逾期 ${Math.abs(delta)} 天`
  if (delta === 0) return '今天'
  if (delta === 1) return '明天'
  if (delta <= 7) return `${delta} 天后`
  return shortDate(date)
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const [people, setPeople] = useState<Person[]>([])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [personModal, setPersonModal] = useState<Person | 'new' | null>(null)
  const [interactionModal, setInteractionModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [backup, setBackup] = useState<BackupFile | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  const refreshData = useCallback(async () => {
    const [nextPeople, nextInteractions] = await Promise.all([database.getPeople(), database.getInteractions()])
    setPeople(nextPeople.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')))
    setInteractions(nextInteractions.sort((a, b) => b.happenedAt.localeCompare(a.happenedAt)))
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refreshData().catch(() => {
      setLoaded(true)
      setNotice({ message: '无法访问本地数据，请检查浏览器存储权限。', tone: 'error' })
    })
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [refreshData])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 3600)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people])
  const currentPerson = route.personId ? personById.get(route.personId) : undefined
  const currentInteractions = useMemo(
    () => currentPerson ? interactions.filter((item) => item.personId === currentPerson.id) : [],
    [currentPerson, interactions],
  )
  const followUps = useMemo(
    () => people.filter((person) => person.nextFollowUpAt && person.nextFollowUpAt <= addDays(today(), 7)).sort((a, b) => a.nextFollowUpAt.localeCompare(b.nextFollowUpAt)),
    [people],
  )
  const notify = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone })
  const go = (hash: string) => { window.location.hash = hash }

  const savePerson = async (fields: PersonFields, existing?: Person) => {
    const now = new Date().toISOString()
    const person: Person = {
      ...fields,
      id: existing?.id ?? createId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await database.savePerson(person)
      await refreshData()
      setPersonModal(null)
      notify(existing ? '资料已更新' : '已添加到联系人')
      if (!existing) go(`/people/${encodeURIComponent(person.id)}`)
    } catch {
      notify('保存失败，请检查浏览器本地存储后重试。', 'error')
    }
  }

  const removePerson = async (person: Person) => {
    if (!window.confirm(`删除「${person.name}」及其所有互动记录？此操作无法撤销。`)) return
    try {
      await database.deletePerson(person.id)
      await refreshData()
      go('/people')
      notify('联系人和相关互动记录已删除')
    } catch {
      notify('删除失败，请稍后重试。', 'error')
    }
  }

  const saveInteraction = async (fields: InteractionFields) => {
    if (!currentPerson) return
    const interaction: Interaction = {
      ...fields,
      personId: currentPerson.id,
      id: createId(),
      createdAt: new Date().toISOString(),
    }
    try {
      await database.saveInteraction(interaction)
      const updatedPerson = { ...currentPerson, nextFollowUpAt: currentPerson.nextFollowUpAt, updatedAt: new Date().toISOString() }
      await database.savePerson(updatedPerson)
      await refreshData()
      setInteractionModal(false)
      notify('互动记录已保存')
    } catch {
      notify('互动记录保存失败，请稍后重试。', 'error')
    }
  }

  const exportBackup = async () => {
    try {
      const content = await database.exportAll()
      const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `relationflow-backup-${today()}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('备份文件已下载')
    } catch {
      notify('导出失败，请稍后重试', 'error')
    }
  }

  const chooseBackup = async (file?: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      notify('备份文件不能超过 10 MB', 'error')
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isBackupFile(parsed)) throw new Error('格式不匹配')
      const personIds = new Set(parsed.people.map((person) => person.id))
      if (parsed.interactions.some((interaction) => !personIds.has(interaction.personId))) throw new Error('备份记录不完整')
      setBackup(parsed)
      setImportMode('merge')
    } catch {
      notify('无法识别此备份文件，请选择 RelationFlow 导出的 JSON 文件。', 'error')
    }
  }

  const applyBackup = async () => {
    if (!backup) return
    try {
      await database.importAll(backup, importMode === 'replace')
      await refreshData()
      setBackup(null)
      notify(importMode === 'replace' ? '数据已从备份恢复' : '备份内容已合并')
    } catch {
      notify('恢复失败，当前本地数据未更改。', 'error')
    }
  }

  const clearData = async () => {
    if (!window.confirm('确定清除这台设备浏览器中的全部联系人和互动记录？建议先导出备份。')) return
    try {
      await database.clearAll()
      await refreshData()
      notify('本地数据已清除')
    } catch {
      notify('清除失败，请稍后重试。', 'error')
    }
  }

  const pageTitle = route.page === 'home' ? '今天' : route.page === 'people' ? '联系人' : route.page === 'settings' ? '设置' : currentPerson?.name ?? '联系人详情'
  const filteredPeople = people.filter((person) => {
    const matchesSearch = `${person.name} ${person.company} ${person.tags.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())
    const matchesFilter = filter === 'all' || person.relationship === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/" aria-label="RelationFlow 工作台">
          <span className="brand-mark"><Icon name="heart" size={19} /></span>
          <span className="brand-copy"><strong>relationflow</strong><small>把关系放在心上</small></span>
        </a>
        <div className="side-label">工作空间</div>
        <nav className="side-nav" aria-label="主导航">
          <NavLink active={route.page === 'home'} href="#/" icon="home">今日概览</NavLink>
          <NavLink active={route.page === 'people' || route.page === 'person'} href="#/people" icon="people">我的联系人<span className="nav-count">{people.length}</span></NavLink>
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">✳</span>
          <p>好的关系，来自持续而真诚的关心。</p>
          <span className="note-caption">给自己的一点提醒</span>
        </div>
        <div className="side-footer">
          <span className="privacy-dot"><Icon name="shield" size={15} /></span>
          <span><strong>仅保存在此设备</strong><small>你的记录不会上传</small></span>
        </div>
        <NavLink active={route.page === 'settings'} href="#/settings" icon="settings" className="settings-link">设置与备份</NavLink>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Icon name="heart" size={18} /></span><strong>relationflow</strong></div>
          <div className="breadcrumbs"><span>我的空间</span><span className="crumb-separator">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <span className="today-date">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span>
            <button className="avatar-button" aria-label="打开设置" onClick={() => go('/settings')}>我</button>
          </div>
        </header>

        {!loaded ? <div className="loading-state"><span className="spinner" />正在打开你的空间…</div> : (
          <div className="page-content">
            {route.page === 'home' && <Dashboard people={people} interactions={interactions} followUps={followUps} personById={personById} onAdd={() => setPersonModal('new')} onGo={go} />}
            {route.page === 'people' && <PeoplePage people={filteredPeople} total={people.length} search={search} filter={filter} setSearch={setSearch} setFilter={setFilter} onAdd={() => setPersonModal('new')} onGo={go} />}
            {route.page === 'person' && currentPerson && <PersonPage person={currentPerson} interactions={currentInteractions} onBack={() => go('/people')} onEdit={() => setPersonModal(currentPerson)} onDelete={() => void removePerson(currentPerson)} onAddInteraction={() => setInteractionModal(true)} />}
            {route.page === 'person' && !currentPerson && <EmptyMissing onBack={() => go('/people')} />}
            {route.page === 'settings' && <SettingsPage people={people} interactions={interactions} onExport={() => void exportBackup()} onChoose={chooseBackup} onClear={() => void clearData()} />}
          </div>
        )}

        <nav className="mobile-nav" aria-label="移动端导航">
          <NavLink active={route.page === 'home'} href="#/" icon="home">今天</NavLink>
          <NavLink active={route.page === 'people' || route.page === 'person'} href="#/people" icon="people">联系人</NavLink>
          <NavLink active={route.page === 'settings'} href="#/settings" icon="settings">设置</NavLink>
        </nav>
      </main>

      {personModal && <PersonModal person={personModal === 'new' ? undefined : personModal} onClose={() => setPersonModal(null)} onSave={savePerson} />}
      {interactionModal && currentPerson && <InteractionModal onClose={() => setInteractionModal(false)} onSave={saveInteraction} />}
      {backup && <ImportModal backup={backup} mode={importMode} setMode={setImportMode} onClose={() => setBackup(null)} onImport={() => void applyBackup()} />}
      {notice && <div className={`toast toast-${notice.tone}`} role="status"><Icon name={notice.tone === 'success' ? 'check' : 'close'} size={17} />{notice.message}</div>}
    </div>
  )
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + days)
  return value.toISOString().slice(0, 10)
}

function NavLink({ active, href, icon, children, className = '' }: { active: boolean; href: string; icon: string; children: ReactNode; className?: string }) {
  return <a className={`nav-link ${active ? 'active' : ''} ${className}`} href={href}><Icon name={icon} size={18} /><span>{children}</span></a>
}

function Dashboard({ people, interactions, followUps, personById, onAdd, onGo }: {
  people: Person[]; interactions: Interaction[]; followUps: Person[]; personById: Map<string, Person>; onAdd: () => void; onGo: (hash: string) => void
}) {
  const overdue = followUps.filter((person) => person.nextFollowUpAt < today()).length
  return <>
    <div className="welcome-row">
      <div><div className="eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</div><h1>关系，慢慢经营。<span className="heading-flower">✳</span></h1><p className="page-intro">留一点时间，给那些对你重要的人。</p></div>
      <button className="button button-primary" onClick={onAdd}><Icon name="plus" size={18} />添加联系人</button>
    </div>

    <section className="stats-grid" aria-label="关系概览">
      <StatCard icon="people" label="我的联系人" value={people.length} unit="位" foot="每一段关系都值得用心" color="sage" />
      <StatCard icon="calendar" label="近期要联系" value={followUps.length} unit="位" foot={overdue ? `${overdue} 位已超过计划日期` : '未来 7 天的跟进计划'} color="amber" />
      <StatCard icon="note" label="记录的时刻" value={interactions.length} unit="条" foot="最近的交流与回忆" color="rose" />
    </section>

    <div className="dashboard-grid">
      <section className="panel followup-panel">
        <div className="section-heading"><div><div className="eyebrow">KEEP IN TOUCH</div><h2>最近要联系</h2></div><button className="text-button" onClick={() => onGo('/people')}>查看联系人 <Icon name="arrow" size={15} /></button></div>
        {followUps.length ? <div className="followup-list">{followUps.slice(0, 5).map((person) => <button className="followup-row" key={person.id} onClick={() => onGo(`/people/${encodeURIComponent(person.id)}`)}>
          <Avatar name={person.name} tone={relationshipColor[person.relationship]} /><span className="followup-person"><strong>{person.name}</strong><small>{relationshipLabels[person.relationship]}{person.company ? ` · ${person.company}` : ''}</small></span>
          <span className={`date-pill ${person.nextFollowUpAt < today() ? 'overdue' : ''}`}><Icon name="calendar" size={14} />{friendlyDate(person.nextFollowUpAt)}</span><Icon name="arrow" size={16} />
        </button>)}</div> : <EmptyPanel icon="calendar" title="还没有近期提醒" text="在联系人资料里设定下次联系日期，温柔地记住这件事。" action="去看看联系人" onClick={() => onGo('/people')} />}
      </section>

      <section className="panel recent-panel">
        <div className="section-heading"><div><div className="eyebrow">LITTLE MOMENTS</div><h2>最近的时刻</h2></div><span className="tiny-icon"><Icon name="heart" size={17} /></span></div>
        {interactions.length ? <div className="timeline compact">{interactions.slice(0, 4).map((item) => {
          const person = personById.get(item.personId)
          if (!person) return null
          return <button className="timeline-item" key={item.id} onClick={() => onGo(`/people/${encodeURIComponent(person.id)}`)}><span className={`timeline-dot ${relationshipColor[person.relationship]}`} /><span className="timeline-copy"><strong>{item.summary || item.kind}</strong><small>{person.name} · {timestamp(item.happenedAt)}</small></span></button>
        })}</div> : <EmptyPanel icon="note" title="记录第一次互动" text="聊过的一句话、一起做的事，都可以留在这里。" action="添加联系人" onClick={onAdd} />}
      </section>
    </div>

    <section className="gentle-reminder"><div className="reminder-art"><span>✳</span><i /><b /></div><div><div className="eyebrow">A SMALL REMINDER</div><h2>关心不必很隆重，<br className="desktop-only" />记得就很好。</h2><p>从一个简单的问候开始，也是一份心意。</p></div><button className="button button-soft" onClick={onAdd}>整理我的关系 <Icon name="arrow" size={17} /></button></section>
    <div className="page-footnote"><Icon name="shield" size={14} />所有内容只保存在这台设备的浏览器中。</div>
  </>
}

function StatCard({ icon, label, value, unit, foot, color }: { icon: string; label: string; value: number; unit: string; foot: string; color: string }) {
  return <article className="stat-card"><div className={`stat-icon ${color}`}><Icon name={icon} size={18} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}<span>{unit}</span></div><div className="stat-foot">{foot}</div></article>
}

function Avatar({ name, tone, large = false }: { name: string; tone: string; large?: boolean }) {
  return <span className={`person-avatar tone-${tone} ${large ? 'large' : ''}`}>{initials(name)}</span>
}

function EmptyPanel({ icon, title, text, action, onClick }: { icon: string; title: string; text: string; action: string; onClick: () => void }) {
  return <div className="empty-panel"><span className="empty-icon"><Icon name={icon} size={19} /></span><strong>{title}</strong><p>{text}</p><button className="text-button" onClick={onClick}>{action} <Icon name="arrow" size={14} /></button></div>
}

function PeoplePage({ people, total, search, filter, setSearch, setFilter, onAdd, onGo }: {
  people: Person[]; total: number; search: string; filter: string; setSearch: (value: string) => void; setFilter: (value: string) => void; onAdd: () => void; onGo: (hash: string) => void
}) {
  return <>
    <div className="welcome-row people-heading"><div><div className="eyebrow">YOUR CIRCLE</div><h1>我的联系人</h1><p className="page-intro">{total ? `认真记下 ${total} 段对你重要的关系。` : '把对你重要的人，轻轻收进这个空间。'}</p></div><button className="button button-primary" onClick={onAdd}><Icon name="plus" size={18} />添加联系人</button></div>
    <div className="people-toolbar"><label className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、备注或标签" aria-label="搜索联系人" />{search && <button aria-label="清除搜索" onClick={() => setSearch('')}><Icon name="close" size={15} /></button>}</label><div className="filter-tabs" aria-label="按关系筛选"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>全部 <span>{total}</span></button>{(Object.entries(relationshipLabels) as [Relationship, string][]).map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
    {people.length ? <div className="people-grid">{people.map((person) => <button className="person-card" key={person.id} onClick={() => onGo(`/people/${encodeURIComponent(person.id)}`)}>
      <div className="person-card-top"><Avatar name={person.name} tone={relationshipColor[person.relationship]} large /><span className={`relationship-badge ${relationshipColor[person.relationship]}`}>{relationshipLabels[person.relationship]}</span></div>
      <div className="person-card-name">{person.name}</div><div className="person-card-meta">{person.company || '留在你的生活里'}</div>
      {person.note && <p className="person-card-note">{person.note}</p>}
      <div className="person-card-bottom">{person.tags.length ? <div className="tag-list">{person.tags.slice(0, 2).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div> : <span className="muted-mini">尚无标签</span>}{person.nextFollowUpAt && <span className="mini-followup"><Icon name="calendar" size={13} />{friendlyDate(person.nextFollowUpAt)}</span>}</div>
    </button>)}</div> : total ? <div className="empty-search"><span className="empty-icon"><Icon name="search" /></span><strong>没有找到匹配的人</strong><p>试试其他关键词或关系类别。</p><button className="text-button" onClick={() => { setSearch(''); setFilter('all') }}>清除筛选 <Icon name="arrow" size={14} /></button></div> : <div className="empty-large"><div className="empty-illustration"><span><Icon name="heart" size={28} /></span><i>✳</i></div><h2>这里还很安静。</h2><p>添加第一个联系人，开始记录你在意的人与相处的时刻。</p><button className="button button-primary" onClick={onAdd}><Icon name="plus" size={18} />添加第一位联系人</button></div>}
    <div className="page-footnote"><Icon name="shield" size={14} />个人信息只保存在当前浏览器，不会上传。</div>
  </>
}

function PersonPage({ person, interactions, onBack, onEdit, onDelete, onAddInteraction }: {
  person: Person; interactions: Interaction[]; onBack: () => void; onEdit: () => void; onDelete: () => void; onAddInteraction: () => void
}) {
  return <>
    <button className="back-link" onClick={onBack}><Icon name="back" size={17} />返回联系人</button>
    <section className="profile-hero"><div className="profile-orbit orbit-one" /><div className="profile-orbit orbit-two" /><div className="profile-identity"><Avatar name={person.name} tone={relationshipColor[person.relationship]} large /><div><span className={`relationship-badge ${relationshipColor[person.relationship]}`}>{relationshipLabels[person.relationship]}</span><h1>{person.name}</h1><p>{person.company || '你在意的人'}</p></div></div><div className="profile-actions"><button className="button button-white" onClick={onEdit}>编辑资料</button><button className="icon-button light" aria-label="删除联系人" title="删除联系人" onClick={onDelete}><Icon name="more" size={19} /></button></div></section>
    <div className="profile-grid"><div className="profile-main">
      <section className="panel profile-note-panel"><div className="section-heading"><div><div className="eyebrow">A NOTE TO REMEMBER</div><h2>关于 {person.name}</h2></div><Icon name="note" size={19} /></div><p className="long-note">{person.note || '还没有写下备注。记录一点相处中的小细节，帮助自己记住对方在意的事。'}</p>{person.tags.length > 0 && <div className="tag-list profile-tags">{person.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}</section>
      <section className="panel timeline-panel"><div className="section-heading"><div><div className="eyebrow">MEMORY LANE</div><h2>相处的时刻</h2></div><button className="button button-outline small" onClick={onAddInteraction}><Icon name="plus" size={16} />记一笔</button></div>
        {interactions.length ? <div className="timeline full">{interactions.map((item) => <article className="timeline-entry" key={item.id}><span className="timeline-dot sage" /><div className="timeline-entry-head"><strong>{item.kind}</strong><time>{timestamp(item.happenedAt)}</time></div><p>{item.summary}</p></article>)}</div> : <EmptyPanel icon="note" title="还没有互动记录" text="留下一次聊天、散步或见面的记忆。" action="记录一次互动" onClick={onAddInteraction} />}
      </section>
    </div><aside className="panel profile-aside"><div className="eyebrow">STAY IN TOUCH</div><h2>保持联系</h2><div className="followup-info"><span className="calendar-tile"><Icon name="calendar" size={19} /></span><div><small>下次联系</small><strong>{person.nextFollowUpAt ? shortDate(person.nextFollowUpAt) : '尚未安排'}</strong></div></div>{person.nextFollowUpAt && <span className={`followup-hint ${person.nextFollowUpAt < today() ? 'late' : ''}`}>{friendlyDate(person.nextFollowUpAt)}，记得问候一下</span>}<button className="button button-soft full-width" onClick={onEdit}>{person.nextFollowUpAt ? '调整联系计划' : '设置下次联系'} <Icon name="arrow" size={16} /></button><div className="aside-divider" /><p className="privacy-callout"><Icon name="shield" size={16} />这些内容只存在当前浏览器的本地空间里。</p></aside></div>
  </>
}

function SettingsPage({ people, interactions, onExport, onChoose, onClear }: {
  people: Person[]; interactions: Interaction[]; onExport: () => void; onChoose: (file?: File) => void; onClear: () => void
}) {
  return <>
    <div className="welcome-row"><div><div className="eyebrow">YOUR SPACE</div><h1>设置与数据</h1><p className="page-intro">管理你的本地记录，随时带走一份备份。</p></div></div>
    <section className="privacy-banner"><span className="privacy-banner-icon"><Icon name="shield" size={23} /></span><div><strong>你的关系记录，只留在这台设备。</strong><p>数据存储在浏览器本地，不会上传到服务器或 GitHub。</p></div><span className="privacy-stamp">本地存储</span></section>
    <div className="settings-layout"><div className="settings-main">
      <section className="panel settings-card"><div className="settings-card-heading"><span className="settings-icon sage"><Icon name="download" size={19} /></span><div><h2>备份与恢复</h2><p>将资料导出为 JSON 文件，或从文件恢复到当前浏览器。</p></div></div><div className="backup-summary"><span><strong>{people.length}</strong> 位联系人</span><i /><span><strong>{interactions.length}</strong> 条互动记录</span><i /><span>自动更新至当前状态</span></div><div className="settings-actions"><button className="button button-primary" onClick={onExport}><Icon name="download" size={17} />导出备份</button><label className="button button-outline file-button"><Icon name="upload" size={17} />导入备份<input type="file" accept="application/json,.json" onChange={(event) => { onChoose(event.target.files?.[0]); event.currentTarget.value = '' }} /></label></div><p className="settings-footnote">备份文件未加密，请妥善保存在安全的位置。建议在更换设备或清理浏览器前先导出。</p></section>
      <section className="panel settings-card danger-card"><div className="settings-card-heading"><span className="settings-icon rose"><Icon name="close" size={19} /></span><div><h2>清除本地数据</h2><p>删除这台浏览器中保存的所有联系人和互动记录。</p></div></div><button className="button button-danger-outline" onClick={onClear}>清除全部数据</button></section>
    </div><aside className="panel settings-side"><div className="eyebrow">A NOTE FOR YOU</div><h2>留一份备份，<br />心里更踏实。</h2><p>浏览器数据和这台设备绑定。导出的备份文件是恢复资料的唯一方式。</p><div className="settings-illustration"><div className="backup-box"><Icon name="note" size={24} /><span>关系备份</span></div><i>✳</i><b>♥</b></div><div className="aside-divider" /><small className="settings-version">RelationFlow · 本地版</small></aside></div>
  </>
}

function EmptyMissing({ onBack }: { onBack: () => void }) {
  return <div className="empty-large"><div className="empty-illustration"><span><Icon name="people" size={28} /></span></div><h2>没有找到这个联系人。</h2><p>资料可能已删除，或链接不再有效。</p><button className="button button-outline" onClick={onBack}>返回联系人</button></div>
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="关闭" onClick={onClose}><Icon name="close" /></button></div>{children}</section></div>
}

function PersonModal({ person, onClose, onSave }: { person?: Person; onClose: () => void; onSave: (fields: PersonFields, existing?: Person) => Promise<void> }) {
  const [name, setName] = useState(person?.name ?? '')
  const [relationship, setRelationship] = useState<Relationship>(person?.relationship ?? 'friend')
  const [company, setCompany] = useState(person?.company ?? '')
  const [tags, setTags] = useState(person?.tags.join('、') ?? '')
  const [note, setNote] = useState(person?.note ?? '')
  const [nextFollowUpAt, setNextFollowUpAt] = useState(person?.nextFollowUpAt ?? '')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), relationship, company: company.trim(), tags: tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12), note: note.trim(), nextFollowUpAt }, person)
    } finally { setSaving(false) }
  }
  return <Modal title={person ? '编辑联系人' : '添加联系人'} subtitle="记下对方，也记下你想好好相处的心意。" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <label className="field"><span>怎么称呼 <b>*</b></span><input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：林晓、妈妈、陈老师" required /></label>
      <div className="form-two"><label className="field"><span>关系</span><select value={relationship} onChange={(event) => setRelationship(event.target.value as Relationship)}>{Object.entries(relationshipLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="field"><span>工作或组织 <small>选填</small></span><input maxLength={80} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：设计团队" /></label></div>
      <label className="field"><span>标签 <small>用顿号分隔</small></span><input maxLength={140} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：喜欢徒步、老同学" /></label>
      <label className="field"><span>关于对方的备注</span><textarea rows={4} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="记下相处中的小细节、对方在意的事……" /></label>
      <label className="field"><span>下次联系日期 <small>选填</small></span><input type="date" min={today()} value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} /></label>
      <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>取消</button><button className="button button-primary" disabled={saving || !name.trim()}>{saving ? '保存中…' : person ? '保存更改' : '添加联系人'}</button></div>
    </form>
  </Modal>
}

function InteractionModal({ onClose, onSave }: { onClose: () => void; onSave: (fields: InteractionFields) => Promise<void> }) {
  const [happenedAt, setHappenedAt] = useState(today())
  const [kind, setKind] = useState('聊天')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!summary.trim()) return
    setSaving(true)
    try { await onSave({ happenedAt, kind, summary: summary.trim() }) } finally { setSaving(false) }
  }
  return <Modal title="记下一个时刻" subtitle="小小的交流，也值得认真记住。" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => void submit(event)}><div className="form-two"><label className="field"><span>发生日期</span><input type="date" max={today()} value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} required /></label><label className="field"><span>相处方式</span><select value={kind} onChange={(event) => setKind(event.target.value)}>{['聊天', '见面', '电话', '一起活动', '其他'].map((item) => <option key={item}>{item}</option>)}</select></label></div><label className="field"><span>这次聊了什么？</span><textarea autoFocus rows={5} maxLength={1000} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="写下你想留住的片段……" required /></label><div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>取消</button><button className="button button-primary" disabled={saving || !summary.trim()}>{saving ? '保存中…' : '保存这段记忆'}</button></div></form>
  </Modal>
}

function ImportModal({ backup, mode, setMode, onClose, onImport }: { backup: BackupFile; mode: 'merge' | 'replace'; setMode: (mode: 'merge' | 'replace') => void; onClose: () => void; onImport: () => void }) {
  return <Modal title="恢复备份" subtitle="确认如何处理这份文件中的记录。" onClose={onClose}>
    <div className="import-preview"><span className="settings-icon sage"><Icon name="note" size={19} /></span><div><strong>RelationFlow 数据备份</strong><small>{backup.people.length} 位联系人 · {backup.interactions.length} 条互动记录</small></div></div>
    <div className="radio-stack"><label className={mode === 'merge' ? 'radio-option chosen' : 'radio-option'}><input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /><span><strong>合并到现有数据</strong><small>相同 ID 的记录以备份文件为准，其他记录保留。</small></span></label><label className={mode === 'replace' ? 'radio-option chosen' : 'radio-option'}><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span><strong>替换现有数据</strong><small>清除当前所有记录，再恢复这份备份。</small></span></label></div>
    <div className="modal-actions"><button className="button button-outline" onClick={onClose}>取消</button><button className="button button-primary" onClick={onImport}>开始恢复</button></div>
  </Modal>
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.format !== 'relationflow-backup' || record.version !== 1 || !Array.isArray(record.people) || !Array.isArray(record.interactions)) return false
  const validRelationships = ['friend', 'family', 'work', 'other']
  const peopleOkay = record.people.every((item) => {
    if (!item || typeof item !== 'object') return false
    const person = item as Record<string, unknown>
    return typeof person.id === 'string' && typeof person.name === 'string' && validRelationships.includes(String(person.relationship)) && Array.isArray(person.tags) && person.tags.every((tag) => typeof tag === 'string') && ['company', 'note', 'nextFollowUpAt', 'createdAt', 'updatedAt'].every((key) => typeof person[key] === 'string')
  })
  const interactionsOkay = record.interactions.every((item) => {
    if (!item || typeof item !== 'object') return false
    const interaction = item as Record<string, unknown>
    return ['id', 'personId', 'happenedAt', 'kind', 'summary', 'createdAt'].every((key) => typeof interaction[key] === 'string')
  })
  return peopleOkay && interactionsOkay
}

export default App
