import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownUp, CheckCircle2, CircleDot, Clock3, Filter, LayoutDashboard, ListTodo, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const identities = [
  {id:'user-admin',label:'Alex Morgan · Admin'},
  {id:'user-member',label:'Sam Lee · Member'},
  {id:'user-auditor',label:'Taylor Reed · Auditor'}
];
type Item = {id:string;title:string;description:string;status:string;priority:string;teamId:string;team?:{name:string};assigneeId:string|null;version:number;updatedAt:string;createdAt:string;requiresApproval:boolean};
type Team = {id:string;name:string;role:string};
type Detail = Item & {comments:{id:string;body:string;createdAt:string;author:{name:string}}[];auditEvents:{id:string;action:string;changes:any;createdAt:string;actor:{name:string}}[]};
const priorities = ['LOW','MEDIUM','HIGH','URGENT'];
const statuses = ['OPEN','IN_PROGRESS','BLOCKED','RESOLVED'];
const priorityLabel:Record<string,string> = {LOW:'Low',MEDIUM:'Medium',HIGH:'High',URGENT:'Urgent'};
const statusLabel:Record<string,string> = {OPEN:'Open',IN_PROGRESS:'In progress',BLOCKED:'Blocked',RESOLVED:'Resolved'};
async function api<T>(path:string, userId:string, options:RequestInit = {}):Promise<T> {
  const response = await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json','x-user-id':userId,...(options.headers||{})}});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
function App(){
  const [userId,setUserId] = useState('user-admin');
  const [items,setItems] = useState<Item[]>([]);
  const [teams,setTeams] = useState<Team[]>([]);
  const [summary,setSummary] = useState({open:0,urgent:0,mine:0,blocked:0});
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('ALL');
  const [priority,setPriority] = useState('ALL');
  const [teamId,setTeamId] = useState('ALL');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [selected,setSelected] = useState<Detail|null>(null);
  const [showCreate,setShowCreate] = useState(false);
  const [notice,setNotice] = useState('');
  const [page,setPage] = useState(1);
  const [pages,setPages] = useState(1);
  const [total,setTotal] = useState(0);
  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try {
      const [list,ts,s] = await Promise.all([
        api<{items:Item[];pages:number;total:number}>(`/api/work-items?page=${page}&limit=20&search=${encodeURIComponent(search)}&status=${status}&priority=${priority}${teamId!=='ALL'?'&teamId='+teamId:''}`,userId),
        api<Team[]>('/api/teams',userId),
        api<typeof summary>('/api/dashboard/summary',userId)
      ]);
      setItems(list.items);setPages(Math.max(1,list.pages));setTotal(list.total);setTeams(ts);setSummary(s);
    } catch(e:any){setError(e.message)} finally {setLoading(false)}
  },[userId,page,search,status,priority,teamId]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[load]);
  const openDetail = async(item:Item)=>{try{setSelected(await api<Detail>(`/api/work-items/${item.id}`,userId))}catch(e:any){setError(e.message)}};
  const transition = async(to:string)=>{
    if(!selected)return;
    try{await api(`/api/work-items/${selected.id}/transition`,userId,{method:'POST',body:JSON.stringify({version:selected.version,to})});setNotice('Workflow updated');setSelected(null);await load()}
    catch(e:any){setNotice(e.message);if(e.message.includes('changed'))await openDetail(selected)}
  };
  const refreshDetail = async()=>{if(selected)await openDetail(selected)};
  const isWriter = useMemo(()=>userId!=='user-auditor',[userId]);
  const [form,setForm] = useState({title:'',description:'',teamId:'',priority:'HIGH',requiresApproval:false});
  useEffect(()=>{if(teams.length&&!teams.some(t=>t.id===form.teamId))setForm(f=>({...f,teamId:teams[0].id}))},[teams]);
  const createItem = async(e:React.FormEvent)=>{
    e.preventDefault(); if(!form.teamId)return;
    try{
      const key=crypto.randomUUID();
      await api('/api/work-items',userId,{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(form)});
      setShowCreate(false);setForm({title:'',description:'',teamId:teams[0]?.id||'',priority:'HIGH',requiresApproval:false});setNotice('Work item created');setPage(1);await load();
    }catch(e:any){setError(e.message)}
  };
  const addComment = async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!selected)return;const data=new FormData(e.currentTarget);const body=String(data.get('body')||'');
    try{await api(`/api/work-items/${selected.id}/comments`,userId,{method:'POST',body:JSON.stringify({body})});await refreshDetail();await load()}
    catch(e:any){setNotice(e.message)}
  };
  const fmt=(d:string)=>new Date(d).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">N</div><div><strong>newtonite</strong><span>OPERATIONS</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="nav active"><LayoutDashboard size={17}/> Overview</button>
      <button className="nav" onClick={()=>{setStatus('ALL');setPriority('ALL');setTeamId('ALL')}}><ListTodo size={17}/> All work <span className="nav-count">{summary.open}</span></button>
      <button className="nav" onClick={()=>setStatus('BLOCKED')}><AlertTriangle size={17}/> Blocked <span className="nav-count">{summary.blocked}</span></button>
      <button className="nav" onClick={()=>setPriority('URGENT')}><Clock3 size={17}/> Urgent queue <span className="nav-count">{summary.urgent}</span></button>
      <div className="sidebar-bottom"><div className="team-heading"><Users size={15}/> YOUR TEAMS</div>{teams.map(t=><button key={t.id} className="team-link" onClick={()=>setTeamId(t.id)}><span className="team-dot"/>{t.name}<span className="role-tag">{t.role.toLowerCase()}</span></button>)}
      <div className="security-note"><ShieldCheck size={17}/><div><b>Access controlled</b><span>Permissions enforced by API</span></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <b>Overview</b></div><div className="top-actions"><span className="demo-label">DEMO IDENTITY</span><select value={userId} onChange={e=>{setUserId(e.target.value);setSelected(null);setPage(1)}} aria-label="Demo identity">{identities.map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</select><div className="avatar">{identities.find(i=>i.id===userId)?.label[0]}</div></div></header>
      <section className="content">
        <div className="page-heading"><div><div className="eyebrow">OPERATIONS CENTER <span className="live-dot"/> LIVE DATA</div><h1>Good work starts with clarity.</h1><p>Track ownership, surface risk, and keep important work moving.</p></div><button className="primary-btn" onClick={()=>setShowCreate(true)} disabled={!isWriter}><Plus size={17}/> New work item</button></div>
        {error&&<div className="error-banner"><AlertTriangle size={17}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
        {notice&&<div className="notice-banner">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-top"><span>Open work</span><div className="stat-icon blue"><ListTodo size={18}/></div></div><div className="stat-value">{summary.open}</div><div className="stat-foot">Across your teams</div></div>
          <div className="stat-card"><div className="stat-top"><span>Urgent priority</span><div className="stat-icon red"><AlertTriangle size={18}/></div></div><div className="stat-value">{summary.urgent}</div><div className="stat-foot"><span className="red-text">Needs attention</span></div></div>
          <div className="stat-card"><div className="stat-top"><span>Assigned to me</span><div className="stat-icon violet"><CircleDot size={18}/></div></div><div className="stat-value">{summary.mine}</div><div className="stat-foot">Active ownership</div></div>
          <div className="stat-card"><div className="stat-top"><span>Blocked items</span><div className="stat-icon amber"><Clock3 size={18}/></div></div><div className="stat-value">{summary.blocked}</div><div className="stat-foot">May need intervention</div></div>
        </div>
        <section className="work-panel">
          <div className="panel-heading"><div><h2>Operational work</h2><p>Find the right issue and understand what needs to happen next.</p></div><button className="icon-btn" onClick={()=>void load()} title="Refresh"><RefreshCw size={16}/></button></div>
          <div className="filters"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search title or description..." /></div><div className="filter-control"><Filter size={15}/><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="ALL">All statuses</option>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></div><div className="filter-control"><select value={priority} onChange={e=>{setPriority(e.target.value);setPage(1)}}><option value="ALL">All priorities</option>{priorities.map(p=><option key={p} value={p}>{priorityLabel[p]}</option>)}</select></div><div className="filter-control"><select value={teamId} onChange={e=>{setTeamId(e.target.value);setPage(1)}}><option value="ALL">All teams</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>WORK ITEM</th><th>STATUS</th><th>PRIORITY</th><th>TEAM</th><th>UPDATED</th><th></th></tr></thead><tbody>
          {loading?<tr><td colSpan={6} className="empty"><RefreshCw className="spin" size={18}/> Loading work items…</td></tr>:items.length===0?<tr><td colSpan={6} className="empty">No work items match these filters.</td></tr>:items.map(item=><tr key={item.id} onClick={()=>void openDetail(item)} className="click-row"><td><div className="item-title">{item.title}</div><div className="item-sub">{item.description}</div></td><td><span className={`status status-${item.status.toLowerCase()}`}><span/>{statusLabel[item.status]}</span></td><td><span className={`priority priority-${item.priority.toLowerCase()}`}><i/>{priorityLabel[item.priority]}</span></td><td><span className="team-cell">{item.team?.name||teams.find(t=>t.id===item.teamId)?.name||'Team'}</span></td><td className="date-cell">{fmt(item.updatedAt)}</td><td><ArrowDownUp size={15} className="row-arrow"/></td></tr>)}
          </tbody></table></div>
          <div className="table-footer"><span>Showing {items.length} of {total} work items</span><div className="pagination"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>
        </section>
        <div className="bottom-grid"><div className="info-card"><div className="info-icon"><Activity size={18}/></div><div><b>Every change has a history</b><p>Assignment, priority, status, and comments are recorded against the work item.</p></div></div><div className="info-card"><div className="info-icon green"><CheckCircle2 size={18}/></div><div><b>Built for safe collaboration</b><p>Version checks reject stale edits instead of silently overwriting newer work.</p></div></div></div>
        <footer>NEWTONITE OPS <span>·</span> OPERATIONAL WORK MANAGEMENT <span className="footer-right">ASSESSMENT BUILD 1.0</span></footer>
      </section>
    </main>
    {showCreate&&<div className="modal-backdrop" onClick={()=>setShowCreate(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">CREATE RECORD</span><h2>New work item</h2></div><button className="icon-btn" onClick={()=>setShowCreate(false)}><X size={18}/></button></div><form onSubmit={createItem} className="form"><label>Title<input required minLength={3} maxLength={180} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What needs attention?" /></label><label>Description<textarea required value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Add context, impact, and what a good outcome looks like." rows={4}/></label><div className="form-row"><label>Team<select value={form.teamId} onChange={e=>setForm({...form,teamId:e.target.value})}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{priorities.map(p=><option key={p} value={p}>{priorityLabel[p]}</option>)}</select></label></div><label className="checkbox"><input type="checkbox" checked={form.requiresApproval} onChange={e=>setForm({...form,requiresApproval:e.target.checked})}/> Requires approval before resolution</label><div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary-btn"><Plus size={16}/> Create work item</button></div></form></div></div>}
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="detail-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">WORK ITEM · V{selected.version}</span><h2>{selected.title}</h2><p className="detail-description">{selected.description}</p></div><button className="icon-btn" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="detail-meta"><span className={`status status-${selected.status.toLowerCase()}`}><span/>{statusLabel[selected.status]}</span><span className={`priority priority-${selected.priority.toLowerCase()}`}><i/>{priorityLabel[selected.priority]}</span><span className="team-cell">{selected.team?.name}</span></div><div className="detail-section"><h3>Move workflow</h3><div className="transition-actions">{statuses.filter(s=>s!==selected.status).map(s=><button key={s} className="secondary-btn" disabled={!isWriter||!(s==='IN_PROGRESS'&&selected.status==='OPEN'||s==='BLOCKED'&&selected.status==='IN_PROGRESS'||s==='RESOLVED'&&['OPEN','IN_PROGRESS'].includes(selected.status)||s==='IN_PROGRESS'&&selected.status==='BLOCKED'||s==='OPEN'&&selected.status==='RESOLVED')} onClick={()=>void transition(s)}>{statusLabel[s]}</button>)}</div><p className="hint">The server validates every transition. Current version: {selected.version}.</p></div><div className="detail-section"><h3>Activity history</h3><div className="timeline">{selected.auditEvents?.length?selected.auditEvents.map(ev=><div className="timeline-item" key={ev.id}><div className="timeline-dot"/><div><b>{ev.action.replaceAll('_',' ').toLowerCase()}</b><p>{ev.actor.name} · {fmt(ev.createdAt)}</p><code>{JSON.stringify(ev.changes)}</code></div></div>):<p className="muted">No history yet.</p>}</div></div><div className="detail-section"><h3>Comments</h3><div className="comments">{selected.comments?.map(c=><div className="comment" key={c.id}><b>{c.author.name}</b><span>{fmt(c.createdAt)}</span><p>{c.body}</p></div>)}</div>{isWriter&&<form className="comment-form" onSubmit={addComment}><input name="body" required maxLength={5000} placeholder="Add a useful update…" /><button className="primary-btn">Comment</button></form>}</div><div className="detail-footer"><span><ShieldCheck size={15}/> Changes are checked by the API</span><button className="secondary-btn" onClick={()=>void refreshDetail()}><RefreshCw size={14}/> Refresh latest</button></div></div></div>}
  </div>
}
export default App;
