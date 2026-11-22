import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, Check, Clock3, FileBarChart, Globe2, Layers3, Map, Menu, Moon, Mountain, Plus, Search, Send, Shield, Sparkles, Sun, X } from 'lucide-react';
const MapPage = lazy(() => import('./MapPage'));
const RiskChart = lazy(() => import('./RiskChart'));

type Region = { id:string; name:string; city:string; lat:number; lon:number };
type Assessment = { id:number; region:string; latitude:number; longitude:number; elevation:number; slope:number; rainfall_accumulation:number; rainfall_intensity:number; soil:string; land_cover:string; fault_distance?:number|null; result:{risk:string;score?:number;model_version?:string;factors?:unknown[]}; created_at:string };
type Alert = {id:number;assessment_id:number;region:string;risk:string;status:string;description:string;created_at:string};
type Model = {ready?:boolean; status?:string; version?:string; model_version?:string; [key:string]:unknown};
const riskNames:Record<string,string>={low:'Төмен',moderate:'Орташа',high:'Жоғары'};
const statusNames:Record<string,string>={new:'Жаңа',reviewed:'Қаралған',closed:'Жабылған'};
const date=(s:string)=>new Date(s).toLocaleString('kk-KZ');
class ApiError extends Error {
 constructor(message: string, readonly status: number) {
  super(message);
 }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
 const response = await fetch(url, {
  ...init,
  headers: { 'Content-Type': 'application/json', ...init?.headers },
 });
 if (!response.ok) {
  const error = await response.json().catch(() => null);
  const message = typeof error?.detail === 'string'
   ? error.detail
   : 'Сұрауды орындау мүмкін болмады';
  throw new ApiError(message, response.status);
 }
 return response.json();
}
const nav=[['/', 'Бақылау панелі', Activity],['/map','Географиялық карта',Map],['/prediction','ЖИ болжамы',Sparkles],['/alerts','Ескертулер',Bell],['/reports','Есептер',FileBarChart],['/model','Модель зертханасы',Layers3]] as const;
function App(){
 const [regions,setRegions]=useState<Region[]>([]),[assessments,setAssessments]=useState<Assessment[]>([]),[alerts,setAlerts]=useState<Alert[]>([]),[model,setModel]=useState<Model>({}),[online,setOnline]=useState(false),[dark,setDark]=useState(() => localStorage.getItem('georisk-theme') === 'dark'),[menu,setMenu]=useState(false),[query,setQuery]=useState('');
 const [prefill,setPrefill]=useState<{region:string;lat?:number;lon?:number}>({region:''}); const navigate=useNavigate();
 const [needsLogin, setNeedsLogin] = useState(false);
 const refresh = async () => {
  const [regionResult, assessmentResult, alertResult, modelResult, healthResult] =
   await Promise.allSettled([
    api<Region[]>('/api/regions'),
    api<Assessment[]>('/api/assessments'),
    api<Alert[]>('/api/alerts'),
    api<Model>('/api/model/status'),
    api('/api/health'),
   ]);
  if (regionResult.status === 'fulfilled') setRegions(regionResult.value);
  if (assessmentResult.status === 'fulfilled') setAssessments(assessmentResult.value);
  if (alertResult.status === 'fulfilled') setAlerts(alertResult.value);
  if (modelResult.status === 'fulfilled') setModel(modelResult.value);
  setNeedsLogin(regionResult.status === 'rejected' &&
   regionResult.reason instanceof ApiError && regionResult.reason.status === 401);
  setOnline(healthResult.status === 'fulfilled');
 };
 const { pathname } = useLocation();
 const title = nav.find(([path]) => path === pathname)?.[1] || 'Бақылау панелі';

 useEffect(() => { void refresh(); }, []);
 useEffect(() => {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('georisk-theme', theme);
 }, [dark]);
 useEffect(() => {
  if (!menu) return;
  const closeOnEscape = (event: KeyboardEvent) => {
   if (event.key === 'Escape') setMenu(false);
  };
  window.addEventListener('keydown', closeOnEscape);
  return () => window.removeEventListener('keydown', closeOnEscape);
 }, [menu]);

 const analyze = (region: string, lat?: number, lon?: number) => {
  setPrefill({ region, lat, lon });
  navigate('/prediction');
 };

 return (
  <div className="shell">
   {menu && <button className="nav-scrim" aria-label="Мәзірді жабу" onClick={() => setMenu(false)} />}
   <aside className={menu ? 'sidebar open' : 'sidebar'} id="site-navigation">
    <div className="brand">
     <Link to="/" className="brand-link" onClick={() => setMenu(false)}>
      <span className="brand-icon"><Mountain size={22} strokeWidth={1.7} /></span>
      <span>GeoRisk<span className="brand-ai"> AI</span></span>
     </Link>
     <button className="mobile-close icon-button" onClick={() => setMenu(false)} aria-label="Мәзірді жабу"><X size={20} /></button>
    </div>
    <nav aria-label="Негізгі мәзір">
     {nav.map(([path, label, Icon]) => (
      <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
       <Icon size={18} strokeWidth={1.75} /><span>{label}</span>
      </NavLink>
     ))}
    </nav>
    <div className="connection" aria-live="polite">
     <i className={online && !needsLogin ? 'dot good' : 'dot'} />
     {needsLogin
      ? <a className="text-button" href="/api/session">Серверге кіру</a>
      : online ? 'Серверге қосылған' : 'Сервер қолжетімсіз'}
    </div>
   </aside>

   <main className="main">
    <header className="topbar">
     <button className="menu-button icon-button" onClick={() => setMenu(true)} aria-label="Мәзірді ашу" aria-controls="site-navigation" aria-expanded={menu}><Menu size={21} /></button>
     <span className="breadcrumb">{title}</span>
     <div className="top-actions">
      <form className="search" onSubmit={event => {
       event.preventDefault();
       if (query.trim()) navigate('/reports');
      }}>
       <Search size={17} aria-hidden="true" />
       <input type="search" aria-label="Есептерден іздеу" placeholder="Есептерден іздеу" value={query} onChange={event => setQuery(event.target.value)} />
      </form>
      <button className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? 'Ашық тақырып' : 'Күңгірт тақырып'}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
      <button className="icon-button notification" onClick={() => navigate('/alerts')} aria-label="Ескертулер"><Bell size={19} />{alerts.some(alert => alert.status === 'new') && <b />}</button>
     </div>
    </header>

    <div className="content">
     <Routes>
      <Route path="/" element={<Dashboard assessments={assessments} alerts={alerts} model={model} onAnalyze={() => analyze('')} onMap={() => navigate('/map')} />} />
      <Route path="/map" element={
       <Suspense fallback={<p role="status">Карта жүктелуде…</p>}>
        <MapPage assessments={assessments} onAnalyze={analyze} />
       </Suspense>
      } />
      <Route path="/prediction" element={<Prediction regions={regions} model={model} prefill={prefill} refresh={refresh} />} />
      <Route path="/alerts" element={<Alerts alerts={alerts} refresh={refresh} />} />
      <Route path="/reports" element={<Reports assessments={assessments} query={query} />} />
      <Route path="/model" element={<ModelLab model={model} />} />
     </Routes>
     <footer><span>© 2026 GeoRisk AI</span><span>Зерттеу құралы · Ресми төтенше жағдай ескертуі емес</span></footer>
    </div>
   </main>
  </div>
 );
}

function Heading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
 return (
  <div className="page-heading">
   <div><h1>{title}</h1><p>{description}</p></div>
   {action}
  </div>
 );
}

type DashboardProps = {
 assessments: Assessment[];
 alerts: Alert[];
 model: Model;
 onAnalyze: () => void;
 onMap: () => void;
};

function Dashboard({ assessments, alerts, model, onAnalyze, onMap }: DashboardProps) {
 const reduceMotion = useReducedMotion();
 const counts = { low: 0, moderate: 0, high: 0 };
 for (const { result } of assessments) {
  if (result.risk === 'low' || result.risk === 'moderate' || result.risk === 'high') {
   counts[result.risk]++;
  }
 }
 const regions = new Set(assessments.map(assessment => assessment.region)).size;
 const chart = [
  { name: riskNames.low, count: counts.low, color: 'var(--risk-low)' },
  { name: riskNames.moderate, count: counts.moderate, color: 'var(--risk-moderate)' },
  { name: riskNames.high, count: counts.high, color: 'var(--risk-high)' },
 ];

 return (
  <motion.div initial={reduceMotion ? false : { y: 5 }} animate={{ y: 0 }} transition={{ duration: 0.2 }}>
   <Heading
    title="Бақылау панелі"
    description="Қазақстандағы геологиялық қауіптерді бақылау."
    action={<button className="button primary" onClick={onAnalyze}><Plus size={17} /> Жаңа талдау</button>}
   />

   <section className="terrain-hero" aria-labelledby="terrain-title">
    <div className="terrain-copy">
     <h2 id="terrain-title">Қазақстанның<br />жер бедері</h2>
     <p>Аймақтарды шолып, картадан сақталған талдаулар мен қауіп нүктелерін көріңіз.</p>
     <button className="button terrain-button" onClick={onMap}>Картаны ашу <ArrowUpRight size={17} /></button>
    </div>
    <figure className="terrain-image">
     <figcaption>Шарын шатқалының бедері · иллюстрация</figcaption>
    </figure>
   </section>

   <section aria-labelledby="overview-title">
    <div className="section-title">
     <h2 id="overview-title">Мониторинг көрсеткіштері</h2>
     {assessments.length > 0 && <span className="muted"><Clock3 size={15} /> Соңғы талдау: {date(assessments[0].created_at)}</span>}
    </div>
    <dl className="stats card">
     <Stat icon={<Globe2 />} label="Талданған аймақтар" value={regions} />
     <Stat icon={<Activity />} label="Жүргізілген талдаулар" value={assessments.length} />
     <Stat icon={<Bell />} label="Жоғары қауіп" value={counts.high} tone="high" />
     <Stat icon={<Layers3 />} label="Орташа қауіп" value={counts.moderate} tone="moderate" />
    </dl>
   </section>

   <div className="dashboard-grid">
    <section className="card chart-card">
     <div className="card-head"><h3>Қауіп санаттары</h3><Activity size={18} aria-hidden="true" /></div>
     {assessments.length > 0 ? (
      <Suspense fallback={<p className="chart" role="status">График жүктелуде…</p>}>
       <RiskChart data={chart} />
      </Suspense>
     ) : <Empty icon={<Activity />} title="Әзірге деректер жоқ" text="Алғашқы талдаудан кейін қауіп санаттары көрсетіледі." />}
    </section>

    <section className="card activity-card">
     <div className="card-head">
      <h3>Соңғы талдаулар</h3>
      <Link to="/reports" className="text-button inline-link">Есептер <ArrowRight size={15} /></Link>
     </div>
     {assessments.length > 0 ? assessments.slice(0, 4).map(assessment => (
      <div className="activity-row" key={assessment.id}>
       <span className="round-icon"><Map size={17} /></span>
       <div><strong>{assessment.region}</strong><small>{date(assessment.created_at)}</small></div>
       <span className={'pill ' + assessment.result.risk}>{riskNames[assessment.result.risk] || 'Белгісіз'}</span>
      </div>
     )) : <Empty icon={<Clock3 />} title="Талдау жүргізілмеген" text="Сақталған талдаулар осы жерде көрінеді." />}
    </section>
   </div>

   <div className="status-strip">
    <div><span className={model.ready ? 'dot good' : 'dot'} /><strong>Модель:</strong> {model.ready ? 'Дайын' : 'Оқытуды қажет етеді'}</div>
    <Link to="/alerts" className="text-button inline-link"><Bell size={16} /> {alerts.filter(alert => alert.status === 'new').length} жаңа ескерту</Link>
   </div>
  </motion.div>
 );
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: string }) {
 return (
  <div className="stat">
   <dt><span>{label}</span><span className={tone ? 'stat-icon ' + tone : 'stat-icon'}>{icon}</span></dt>
   <dd>{value.toLocaleString('kk-KZ')}</dd>
  </div>
 );
}

function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="empty"><div>{icon}</div><strong>{title}</strong><p>{text}</p></div>}
function Prediction({regions,model,prefill,refresh}:{regions:Region[];model:Model;prefill:{region:string;lat?:number;lon?:number};refresh:()=>Promise<void>}){
 const [form,setForm]=useState({region:prefill.region,latitude:prefill.lat?.toString()||'',longitude:prefill.lon?.toString()||'',elevation:'',slope:'',rainfall_accumulation:'',rainfall_intensity:'',soil:'',land_cover:'',fault_distance:''});const [result,setResult]=useState<Assessment|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{setForm(f=>({...f,region:prefill.region,latitude:prefill.lat?.toString()||'',longitude:prefill.lon?.toString()||''}))},[prefill]);
 const change=(key:string,value:string)=>setForm(f=>({...f,[key]:value}));
 async function submit(e:FormEvent){e.preventDefault();setError('');setLoading(true);try{const payload={...form,latitude:Number(form.latitude),longitude:Number(form.longitude),elevation:Number(form.elevation),slope:Number(form.slope),rainfall_accumulation:Number(form.rainfall_accumulation),rainfall_intensity:Number(form.rainfall_intensity),fault_distance:form.fault_distance?Number(form.fault_distance):null};const data=await api<Assessment>('/api/predict',{method:'POST',body:JSON.stringify(payload)});setResult(data);await refresh()}catch(e){setError(e instanceof Error?e.message:'Талдау орындалмады')}finally{setLoading(false)}}
 const field=(key:keyof typeof form,label:string,placeholder:string, min?:number,max?:number,required=true)=><label>{label}<input type="number" step="any" min={min} max={max} required={required} value={form[key]} placeholder={placeholder} onChange={e=>change(key,e.target.value)}/></label>;
 return <><Heading title="ЖИ арқылы талдау" description="Тексерілген жергілікті көрсеткіштерді енгізіп, ықтимал қауіпті бағалаңыз."/><div className="prediction-layout"><form className="card form-card" onSubmit={submit}><div className="card-head"><div><h3>Талдау параметрлері</h3><p>Өлшем бірліктерін тексеріп, барлық міндетті өрістерді толтырыңыз.</p></div><span className="mini-icon"><Sparkles size={18}/></span></div><div className="form-grid"><label className="wide">Аймақты таңдаңыз<select required value={form.region} onChange={e=>change('region',e.target.value)}><option value="">Аймақты таңдаңыз</option>{regions.map(r=><option key={r.name} value={r.name}>{r.name}</option>)}</select></label>{field('latitude','Ендік','43.25',-90,90)}{field('longitude','Бойлық','76.95',-180,180)}{field('elevation','Биіктік, м','Мысалы: 850')}{field('slope','Беткей еңістігі, °','0–90',0,90)}{field('rainfall_accumulation','Жауын-шашын жиынтығы, мм','Мысалы: 24',0)}{field('rainfall_intensity','Жауын қарқындылығы, мм/сағ','Мысалы: 3',0)}<label>Топырақ / геология түрі<input required placeholder="Мысалы: саз" value={form.soil} onChange={e=>change('soil',e.target.value)}/></label><label>Жер жамылғысы<input required placeholder="Мысалы: орман" value={form.land_cover} onChange={e=>change('land_cover',e.target.value)}/></label>{field('fault_distance','Жарылымға дейінгі қашықтық, км','Міндетті емес',0,undefined,false)}</div>{error&&<div className="notice error">{error}</div>}<button className="button primary full" disabled={loading}><Sparkles size={17}/>{loading?'Талдау жүріп жатыр...':'ЖИ арқылы талдау'}</button></form><div><div className="card info-card"><span className="mini-icon"><Shield size={19}/></span><h3>Модель күйі</h3><p>{model.ready?'Модель қолжетімді. Нәтижені кіріс деректерінің сапасын ескере отырып бағалаңыз.':'ЖИ моделі әзірге дайын емес. Нақты деректермен оқыту қажет.'}</p><span className={'pill '+(model.ready?'low':'neutral')}>{model.ready?'Дайын':'Оқытылмаған'}</span></div>{result&&<div className="card info-card result-card"><span className="eyebrow">ТАЛДАУ НӘТИЖЕСІ</span><h3>{riskNames[result.result.risk]||result.result.risk} қауіп</h3><p>Модель нұсқасы: {result.result.model_version||'көрсетілмеген'}</p>{typeof result.result.score==='number'&&<p>Модель көрсеткіші: {(result.result.score*100).toFixed(1)}%</p>}<p>Нәтиже ресми ескерту емес және жергілікті тексеруді алмастырмайды.</p></div>}<Assistant assessmentId={result?.id}/></div></div></>
}
function Assistant({assessmentId}:{assessmentId?:number}){const [message,setMessage]=useState(''),[answer,setAnswer]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);async function send(e:FormEvent){e.preventDefault();setLoading(true);setError('');try{const data=await api<{answer:string}>('/api/assistant',{method:'POST',body:JSON.stringify({message,assessment_id:assessmentId})});setAnswer(data.answer)}catch(e){setError(e instanceof Error?e.message:'Көмекші қолжетімсіз')}finally{setLoading(false)}}return <div className="card info-card assistant"><h3>GeoAI көмекшісі</h3><p>Геологиялық факторларды қазақ тілінде түсіндіріп беремін.</p>{answer&&<div className="answer">{answer}</div>}{error&&<div className="notice error">{error}</div>}<form onSubmit={send} className="chat-form"><input required value={message} onChange={e=>setMessage(e.target.value)} placeholder="Сұрағыңызды жазыңыз..." aria-label="Сұрақ"/><button className="send" disabled={loading} aria-label="Жіберу"><Send size={17}/></button></form><small>Тілдік көмекші болжам моделінен бөлек жұмыс істейді.</small></div>}
function Alerts({alerts,refresh}:{alerts:Alert[];refresh:()=>Promise<void>}){const [filter,setFilter]=useState('all'),[region,setRegion]=useState(''),[selected,setSelected]=useState<Alert|null>(null),[error,setError]=useState('');async function update(id:number,status:string){try{await api('/api/alerts/'+id,{method:'PATCH',body:JSON.stringify({status})});setSelected(null);await refresh()}catch(e){setError(e instanceof Error?e.message:'Қате')}}const shown=alerts.filter(a=>(filter==='all'||a.status===filter)&&a.region.toLowerCase().includes(region.toLowerCase()));return <><Heading title="Ескертулер" description="Талдау нәтижелеріне байланысты ескертулерді бақылаңыз."/><div className="notice"><Shield size={18}/> Бұл ескертулер ресми төтенше жағдай хабарламалары болып саналмайды.</div><div className="card table-card"><div className="filters"><input value={region} onChange={e=>setRegion(e.target.value)} placeholder="Аймақ бойынша іздеу"/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Барлық күй</option><option value="new">Жаңа</option><option value="reviewed">Қаралған</option><option value="closed">Жабылған</option></select></div>{error&&<div className="notice error">{error}</div>}{shown.length?<div className="table-wrap"><table><thead><tr><th>Аймақ</th><th>Қауіп</th><th>Уақыты</th><th>Күйі</th><th/></tr></thead><tbody>{shown.map(a=><tr key={a.id}><td><strong>{a.region}</strong></td><td><span className={'pill '+a.risk}>{riskNames[a.risk]||a.risk}</span></td><td>{date(a.created_at)}</td><td>{statusNames[a.status]||a.status}</td><td><button className="text-button" onClick={()=>setSelected(a)}>Толығырақ →</button></td></tr>)}</tbody></table></div>:<Empty icon={<Bell/>} title="Ескертулер табылмады" text="Жаңа ескертулер осы жерде көрсетіледі."/>}</div>{selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="card modal" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={()=>setSelected(null)} aria-label="Жабу"><X/></button><span className="eyebrow blue">ЕСКЕРТУ #{selected.id}</span><h2>{selected.region}</h2><p>{selected.description}</p><p>Қауіп: {riskNames[selected.risk]||selected.risk} · {date(selected.created_at)}</p><p>Байланысты талдау: #{selected.assessment_id}</p><div className="button-row"><button className="button primary" onClick={()=>void update(selected.id,'reviewed')}><Check size={16}/> Қаралды деп белгілеу</button><button className="button secondary" onClick={()=>void update(selected.id,'closed')}>Жабу</button></div></div></div>}</>}
function Reports({assessments,query}:{assessments:Assessment[];query:string}){const [filter,setFilter]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[selected,setSelected]=useState<Assessment|null>(null);const shown=assessments.filter(a=>a.region.toLowerCase().includes((filter||query).toLowerCase())&&(!from||a.created_at.slice(0,10)>=from)&&(!to||a.created_at.slice(0,10)<=to));function download(){const cols=['id','region','latitude','longitude','elevation','slope','rainfall_accumulation','rainfall_intensity','soil','land_cover','risk','created_at'];const escape=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';const rows=shown.map(a=>[a.id,a.region,a.latitude,a.longitude,a.elevation,a.slope,a.rainfall_accumulation,a.rainfall_intensity,a.soil,a.land_cover,a.result?.risk,a.created_at].map(escape).join(','));const blob=new Blob(['\ufeff'+[cols.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='georisk-assessments.csv';link.click();URL.revokeObjectURL(url)}return <><Heading title="Есептер" description="Бағалау нәтижелерін қараңыз және экспорттаңыз." action={<button className="button secondary" onClick={download} disabled={!shown.length}><ArrowDownToLine size={17}/> CSV жүктеу</button>}/><div className="card table-card"><div className="filters"><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Аймақты іздеу"/><label>Бастап <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Дейін <input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>{shown.length?<div className="table-wrap"><table><thead><tr><th>Аймақ</th><th>Координаталар</th><th>Қауіп</th><th>Күні</th><th/></tr></thead><tbody>{shown.map(a=><tr key={a.id}><td><strong>{a.region}</strong></td><td>{a.latitude.toFixed(3)}, {a.longitude.toFixed(3)}</td><td><span className={'pill '+a.result?.risk}>{riskNames[a.result?.risk]||'Белгісіз'}</span></td><td>{date(a.created_at)}</td><td><button className="text-button" onClick={()=>setSelected(a)}>Қарау →</button></td></tr>)}</tbody></table></div>:<Empty icon={<FileBarChart/>} title="Есептер табылмады" text="Сақталған талдау нәтижелері осы жерде көрсетіледі."/>}</div>{selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="card modal report-modal" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={()=>setSelected(null)} aria-label="Жабу"><X/></button><span className="eyebrow blue">GEORISK AI · ТЕХНИКАЛЫҚ ЕСЕП</span><h2>{selected.region}</h2><p>{date(selected.created_at)} · #{selected.id}</p><hr/><dl><dt>Координаталар</dt><dd>{selected.latitude}, {selected.longitude}</dd><dt>Қауіп санаты</dt><dd>{riskNames[selected.result?.risk]||selected.result?.risk}</dd><dt>Биіктік / еңістік</dt><dd>{selected.elevation} м / {selected.slope}°</dd><dt>Жауын-шашын</dt><dd>{selected.rainfall_accumulation} мм · {selected.rainfall_intensity} мм/сағ</dd><dt>Топырақ / жамылғы</dt><dd>{selected.soil} / {selected.land_cover}</dd><dt>Модель нұсқасы</dt><dd>{selected.result?.model_version||'Көрсетілмеген'}</dd></dl><p>Бұл бағалау енгізілген деректер мен модельге тәуелді; жергілікті тексеруді алмастырмайды және ресми ескерту емес.</p><button className="button primary no-print" onClick={()=>window.print()}>Басып шығару / PDF</button></div></div>}</>}
function ModelLab({model}:{model:Model}){const [file,setFile]=useState<File|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);async function upload(e:FormEvent){e.preventDefault();if(!file)return;setBusy(true);setMessage('');try{const body=new FormData();body.append('file',file);const res=await fetch('/api/datasets/upload',{method:'POST',body});const data=await res.json();if(!res.ok)throw new Error(typeof data.detail==='string'?data.detail:'Файлды тексеру сәтсіз');setMessage('Тексеру нәтижесі: '+JSON.stringify(data))}catch(e){setMessage(e instanceof Error?e.message:'Жүктеу сәтсіз')}finally{setBusy(false)}}return <><Heading title="Деректер және модель" description="Модельдің дайындығын тексеріңіз және деректерді жүктеңіз."/><div className="dashboard-grid"><div className="card info-card"><span className="mini-icon"><Layers3/></span><h3>Модель туралы</h3><p>{model.ready?'Оқытылған модель қолжетімді.':'ЖИ моделі әзірге дайын емес. Нақты деректермен оқыту қажет.'}</p><pre className="model-json">{JSON.stringify(model,null,2)}</pre></div><form className="card info-card" onSubmit={upload}><span className="mini-icon"><ArrowDownToLine/></span><h3>Деректерді жүктеу</h3><p>Үйлесімді CSV немесе GeoJSON файлын таңдаңыз. Координаталар тексеріледі; файл сақталмайды және модельді оқытуға қосылмайды.</p><input type="file" accept=".csv,.geojson,application/geo+json,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)} required/><button className="button primary" disabled={!file||busy}>{busy?'Тексерілуде...':'Файлды тексеру'}</button>{message&&<p className="notice">{message}</p>}</form></div></>}
export default App;
