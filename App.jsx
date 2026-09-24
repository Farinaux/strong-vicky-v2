import React, { useEffect, useMemo, useState } from 'react'
import {
  Home, CalendarDays, BarChart3, History, Download, Settings, MessageCircle,
  Cloud, LogIn, LogOut, ChevronLeft, ChevronRight, Sparkles, CheckCircle2
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar
} from 'recharts'
import * as XLSX from 'xlsx'
import { cloudEnabled, supabase } from './supabase.js'

const START = new Date('2026-09-21T00:00:00')
const DAY_NAMES = ['Ma','Di','Wo','Do','Vr','Za','Zo']
const FULL_DAYS = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']
const emptyDay = () => ({ weight:'', calories:'', strength:'', energy:'', stress:'', sleep:'', steps:'' })
const emptyWeek = week => ({ week, days:Array.from({length:7}, emptyDay), hip:'', navel:'', note:'', coach:'' })
const num = v => {
  if(v === '' || v == null) return null
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : null
}
const avg = arr => { const v = arr.map(num).filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null }
const fmt = (v,d=1) => Number.isFinite(v) ? v.toFixed(d).replace('.',',') : '—'
const weekDates = week => { const a=new Date(START); a.setDate(a.getDate()+(week-1)*7); const b=new Date(a); b.setDate(b.getDate()+6); return [a,b] }
const dateLong = d => d.toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'})
const dateShort = d => d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})

function summarize(w){
  return {
    week:w.week,
    weight:avg(w.days.map(x=>x.weight)), calories:avg(w.days.map(x=>x.calories)),
    strength:avg(w.days.map(x=>x.strength)), energy:avg(w.days.map(x=>x.energy)),
    stress:avg(w.days.map(x=>x.stress)), sleep:avg(w.days.map(x=>x.sleep)),
    steps:avg(w.days.map(x=>x.steps)), hip:num(w.hip), navel:num(w.navel)
  }
}
function delta(a,b,unit=''){
  if(!Number.isFinite(a)||!Number.isFinite(b)) return 'geen vergelijking'
  const d=a-b
  return `${d>0?'+':''}${d.toFixed(1).replace('.',',')} ${unit}`.trim()
}
function phaseForWeek(week){
  const [start]=weekDates(week)
  const m=start.getMonth(), y=start.getFullYear()
  if(y===2026 && m<11) return {name:'Opbouw', kcal:'1.450 kcal'}
  if((y===2026&&m===11)||(y===2027&&m<=1)) return {name:'Bulk', kcal:'tot 1.750 kcal'}
  if(y===2027&&m>=2&&m<=3) return {name:'Afbouw', kcal:'±1.450 kcal'}
  return {name:'Traject', kcal:'persoonlijk doel'}
}
function localCoach(curr, prev){
  if(!curr) return 'Nog onvoldoende gegevens voor feedback.'
  const lines=[]
  if(prev && Number.isFinite(curr.weight)&&Number.isFinite(prev.weight)){
    const d=curr.weight-prev.weight
    lines.push(`Je gemiddelde gewicht veranderde ${d<0?`${Math.abs(d).toFixed(1)} kg omlaag`:d>0?`${d.toFixed(1)} kg omhoog`:'nauwelijks'} ten opzichte van vorige week.`)
  }
  if(Number.isFinite(curr.calories)) lines.push(`Gemiddelde calorie-inname: ${Math.round(curr.calories)} kcal per dag.`)
  if(Number.isFinite(curr.sleep)&&curr.sleep<6.5) lines.push('Je slaap ligt laag. Dat is een concreet herstelpunt en geen detail om te negeren.')
  if(Number.isFinite(curr.stress)&&curr.stress>=7) lines.push('Je stressniveau is hoog. Als dit patroon aanhoudt, verdient herstel prioriteit.')
  if(Number.isFinite(curr.strength)&&Number.isFinite(prev?.strength)&&curr.strength>prev.strength+.5) lines.push('Je krachtniveau stijgt duidelijk. Dat is een concreet positief signaal.')
  if(!lines.length) lines.push('De data laat geen duidelijke afwijking zien. Er is geen reden om iets te forceren of mooier te maken dan het is.')
  lines.push('Advies: pas het plan niet aan op basis van één losse week. Kijk eerst of het patroon zich herhaalt en of de uitvoering consistent was.')
  return lines.join('\n\n')
}

export default function App(){
  const [tab,setTab]=useState('dashboard')
  const [weeks,setWeeks]=useState(()=>{ try{return JSON.parse(localStorage.getItem('sv2_layout_weeks'))||[emptyWeek(1)]}catch{return [emptyWeek(1)]} })
  const [selectedWeek,setSelectedWeek]=useState(1)
  const [activeDay,setActiveDay]=useState(0)
  const [user,setUser]=useState(null)
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [authView,setAuthView]=useState('login')
  const [msg,setMsg]=useState('')
  const [busy,setBusy]=useState(false)
  const [syncState,setSyncState]=useState('idle')
  const [lastSync,setLastSync]=useState(null)
  const [dirtyWeekNo,setDirtyWeekNo]=useState(null)
  const [autoSaveVersion,setAutoSaveVersion]=useState(0)
  const [autoSaveState,setAutoSaveState]=useState('idle')
  const [autoSaveAt,setAutoSaveAt]=useState(null)

  const current = weeks.find(w=>w.week===selectedWeek) || emptyWeek(selectedWeek)
  const summaries = useMemo(()=>weeks.map(summarize).sort((a,b)=>a.week-b.week),[weeks])
  const populatedSummaries = useMemo(()=>summaries.filter(s=>[s.weight,s.calories,s.strength,s.energy,s.stress,s.sleep,s.steps,s.hip,s.navel].some(Number.isFinite)),[summaries])
  const latest = populatedSummaries.at(-1) || summaries.at(-1)
  const prev = populatedSummaries.length>1 ? populatedSummaries.at(-2) : null
  const latestWeek = latest?.week || 1
  const phase = phaseForWeek(latestWeek)

  useEffect(()=>localStorage.setItem('sv2_layout_weeks',JSON.stringify(weeks)),[weeks])
  useEffect(()=>{
    if(!autoSaveVersion || dirtyWeekNo == null) return
    setAutoSaveState('saving')
    const timer=setTimeout(async()=>{
      const week=weeks.find(w=>w.week===dirtyWeekNo)
      if(!week) return
      try{
        if(user) await saveCloud(week)
        setAutoSaveState('saved')
        setAutoSaveAt(new Date())
      }catch(e){
        setAutoSaveState('error')
        setMsg(`Automatisch opslaan mislukt: ${e.message}`)
      }
    },900)
    return ()=>clearTimeout(timer)
  },[autoSaveVersion,dirtyWeekNo,weeks,user])
  useEffect(()=>{
    if(!cloudEnabled) return
    supabase.auth.getSession().then(({data})=>setUser(data.session?.user||null))
    const {data:sub}=supabase.auth.onAuthStateChange((event,session)=>{
      setUser(session?.user||null)
      if(event==='PASSWORD_RECOVERY') setAuthView('reset')
    })
    return ()=>sub.subscription.unsubscribe()
  },[])
  useEffect(()=>{ if(user) syncCloud() },[user])

  async function syncCloud(){
    if(!user || !cloudEnabled) return
    setSyncState('syncing')
    const {data,error}=await supabase.from('checkins').select('*').eq('user_id',user.id).order('week_no')
    if(error){setSyncState('error');setMsg(`Synchronisatie mislukt: ${error.message}`);return}
    try{
      if(data?.length){
        const mapped=data.map(r=>({week:r.week_no,days:r.days||Array.from({length:7},emptyDay),hip:r.hip??'',navel:r.navel??'',note:r.note??'',coach:r.coach??''}))
        setWeeks(mapped); setSelectedWeek(mapped.at(-1).week)
        setMsg('Cloudgegevens geladen. Synchronisatie is actief.')
      }else{
        for(const week of weeks) await saveCloud(week)
        setMsg('Account gekoppeld. Bestaande gegevens zijn naar de cloud gekopieerd.')
      }
      setLastSync(new Date())
      setSyncState('synced')
    }catch(e){
      setSyncState('error'); setMsg(`Synchronisatie mislukt: ${e.message}`)
    }
  }
  async function saveCloud(week){
    if(!user) return
    const {error}=await supabase.from('checkins').upsert({user_id:user.id,week_no:week.week,days:week.days,hip:num(week.hip),navel:num(week.navel),note:week.note,coach:week.coach},{onConflict:'user_id,week_no'})
    if(error) throw error
  }
  function ensureWeek(arr){
    let idx=arr.findIndex(w=>w.week===selectedWeek)
    if(idx<0){arr.push(emptyWeek(selectedWeek)); idx=arr.length-1}
    return idx
  }
  function markForAutoSave(){
    setDirtyWeekNo(selectedWeek)
    setAutoSaveVersion(v=>v+1)
    setAutoSaveState('pending')
  }
  function updateDay(i,key,value){
    setWeeks(prev=>{ const arr=[...prev]; const idx=ensureWeek(arr); arr[idx]={...arr[idx],days:arr[idx].days.map((d,j)=>j===i?{...d,[key]:value}:d)}; return arr.sort((a,b)=>a.week-b.week) })
    markForAutoSave()
  }
  function updateWeek(key,value){
    setWeeks(prev=>{ const arr=[...prev]; const idx=ensureWeek(arr); arr[idx]={...arr[idx],[key]:value}; return arr.sort((a,b)=>a.week-b.week) })
    markForAutoSave()
  }
  async function auth(mode){
    if(!cloudEnabled){setMsg('Supabase is nog niet gekoppeld in Netlify.');return}
    const cleanEmail=email.trim().toLowerCase()
    if(!cleanEmail){setMsg('Vul eerst je e-mailadres in.');return}
    if(mode!=='forgot' && password.length<8){setMsg('Gebruik een wachtwoord van minimaal 8 tekens.');return}
    if(mode==='signup' && password!==confirmPassword){setMsg('De twee wachtwoorden zijn niet gelijk.');return}
    setBusy(true); setMsg('')
    try{
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({
          email:cleanEmail, password,
          options:{emailRedirectTo:window.location.origin}
        })
        if(error) throw error
        if(data.session){
          setMsg('Account aangemaakt en ingelogd. Synchronisatie wordt gestart.')
        }else{
          setMsg('Account aangemaakt. Open de bevestigingsmail van Supabase en klik op de link. Daarna kun je inloggen.')
          setAuthView('login')
        }
      }else if(mode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email:cleanEmail,password})
        if(error) throw error
        setMsg('Ingelogd. Synchronisatie wordt gestart.')
      }else if(mode==='forgot'){
        const {error}=await supabase.auth.resetPasswordForEmail(cleanEmail,{redirectTo:`${window.location.origin}/?reset=1`})
        if(error) throw error
        setMsg('Je ontvangt een e-mail met een link om een nieuw wachtwoord in te stellen.')
      }else if(mode==='reset'){
        if(password!==confirmPassword){setMsg('De twee wachtwoorden zijn niet gelijk.');return}
        const {error}=await supabase.auth.updateUser({password})
        if(error) throw error
        setMsg('Je wachtwoord is gewijzigd.')
        setAuthView('login')
      }
    }catch(e){
      const t=(e.message||'').toLowerCase()
      if(t.includes('invalid login credentials')) setMsg('E-mailadres of wachtwoord klopt niet.')
      else if(t.includes('email not confirmed')) setMsg('Je e-mailadres is nog niet bevestigd. Open eerst de bevestigingsmail van Supabase.')
      else if(t.includes('already registered')) setMsg('Voor dit e-mailadres bestaat al een account. Kies Inloggen.')
      else setMsg(e.message||'Er ging iets mis bij het account.')
    }finally{setBusy(false)}
  }

  async function resendConfirmation(){
    const cleanEmail=email.trim().toLowerCase()
    if(!cleanEmail){setMsg('Vul eerst je e-mailadres in.');return}
    setBusy(true); setMsg('')
    const {error}=await supabase.auth.resend({type:'signup',email:cleanEmail,options:{emailRedirectTo:window.location.origin}})
    setMsg(error?error.message:'Bevestigingsmail opnieuw verzonden.')
    setBusy(false)
  }
  async function aiFeedback(){
    const idx=summaries.findIndex(s=>s.week===selectedWeek)
    const curr=summaries[idx]
    if(!curr){setMsg('Vul eerst gegevens in.');return}
    const history=summaries.slice(Math.max(0,idx-7),idx+1)
    setBusy(true)
    let feedback=''
    try{
      const r=await fetch('/.netlify/functions/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({current:curr,history,note:current.note})})
      if(!r.ok) throw new Error('AI Coach is nog niet actief.')
      const data=await r.json(); feedback=data.feedback
    }catch{ feedback=localCoach(curr,summaries[idx-1]) }
    updateWeek('coach',feedback)
    setBusy(false)
  }
  function exportExcel(){
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summaries.map(s=>({Week:s.week,Gewicht:s.weight,Calorieen:s.calories,Kracht:s.strength,Energie:s.energy,Stress:s.stress,Slaap:s.sleep,Stappen:s.steps,Heup:s.hip,Navel:s.navel}))),'Weekoverzicht')
    const rows=[]; weeks.forEach(w=>w.days.forEach((d,i)=>rows.push({Week:w.week,Dag:FULL_DAYS[i],...d,Heup:i===6?w.hip:'',Navel:i===6?w.navel:''})))
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Dagdata')
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(weeks.map(w=>({Week:w.week,Coachfeedback:w.coach||''}))),'Coachfeedback')
    XLSX.writeFile(wb,'Strong-Vicky-voortgang.xlsx')
  }

  const [a,b]=weekDates(selectedWeek)
  const autoSaveText = autoSaveState==='saving' || autoSaveState==='pending'
    ? 'Opslaan…'
    : autoSaveState==='error'
      ? 'Opslaan mislukt'
      : autoSaveAt
        ? `${user?'Opgeslagen & gesynchroniseerd':'Opgeslagen'} ✓ · ${autoSaveAt.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}`
        : 'Automatisch opslaan actief'
  const nav=[['dashboard',Home,'Dashboard'],['checkin',CalendarDays,'Check-in'],['progress',BarChart3,'Voortgang'],['history',History,'Historie'],['export',Download,'Export'],['coach',MessageCircle,'Coach'],['more',Settings,'Instellingen']]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div>STRONG</div><div>VICKY</div><small>DISCIPLINE CREATES FREEDOM</small></div>
      <nav>{nav.map(([id,Icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={22}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-quote">Stronger<br/>Than Yesterday ♡</div>
    </aside>

    <main>
      {tab==='dashboard' && <Dashboard latest={latest} prev={prev} phase={phase} summaries={populatedSummaries} setTab={setTab}/>} 
      {tab==='checkin' && <>
        <Hero type="checkin" title="Check-in" subtitle="Jouw dagelijkse gewoonten, jouw resultaat."/>
        <WeekSelector selected={selectedWeek} setSelected={setSelectedWeek} max={Math.max(latestWeek+1,selectedWeek)} dates={[a,b]}/>
        <div className="day-tabs">{DAY_NAMES.map((d,i)=><button key={d} className={activeDay===i?'active':''} onClick={()=>setActiveDay(i)}><b>{d}</b><small>{dateShort(new Date(a.getFullYear(),a.getMonth(),a.getDate()+i))}</small></button>)}</div>
        <DayForm day={activeDay} data={current.days[activeDay]} onChange={(k,v)=>updateDay(activeDay,k,v)} week={current} onWeek={updateWeek}/>
        <section className="card note-card"><label>Opmerking bij deze week<textarea value={current.note} onChange={e=>updateWeek('note',e.target.value)} placeholder="Bijzonderheden, vakantie, werkstress, training..."/></label><div className={`autosave-status ${autoSaveState==='error'?'error':''}`}><CheckCircle2 size={17}/><span>{autoSaveText}</span></div></section>
      </>}
      {tab==='progress' && <Progress summaries={summaries}/>} 
      {tab==='history' && <HistoryPage weeks={weeks} summaries={summaries} openWeek={w=>{setSelectedWeek(w);setTab('checkin')}}/>}
      {tab==='export' && <ExportPage exportExcel={exportExcel}/>} 
      {tab==='coach' && <CoachPage week={selectedWeek} current={current} onWeek={updateWeek} aiFeedback={aiFeedback} busy={busy}/>} 
      {tab==='more' && <SettingsPage cloudEnabled={cloudEnabled} user={user} email={email} setEmail={setEmail} password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} authView={authView} setAuthView={setAuthView} auth={auth} resendConfirmation={resendConfirmation} syncCloud={syncCloud} syncState={syncState} lastSync={lastSync} busy={busy} msg={msg}/>} 
    </main>

    <nav className="mobile-nav">{[['dashboard',Home,'Home'],['checkin',CalendarDays,'Check-in'],['progress',BarChart3,'Voortgang'],['history',History,'Historie'],['more',Settings,'Meer']].map(([id,Icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>
  </div>
}

function Hero({type,title,subtitle,children}){return <section className={`hero ${type}-hero`}><div className="hero-copy"><h1>{title}</h1><p>{subtitle}</p>{children}</div></section>}
function Dashboard({latest,prev,phase,summaries,setTab}){
  const week=latest?.week||1; const [a,b]=weekDates(week)
  const firstWith = key => summaries.find(s=>Number.isFinite(s[key]))
  const weightData=summaries.filter(s=>Number.isFinite(s.weight)).map(s=>({week:`W${s.week}`,value:+s.weight.toFixed(2)}))
  const navelData=summaries.filter(s=>Number.isFinite(s.navel)).map(s=>({week:`W${s.week}`,value:s.navel}))
  const hipData=summaries.filter(s=>Number.isFinite(s.hip)).map(s=>({week:`W${s.week}`,value:s.hip}))
  const kcalData=summaries.filter(s=>Number.isFinite(s.calories)).map(s=>({week:`W${s.week}`,value:Math.round(s.calories)}))
  return <>
    <Hero type="dashboard" title="Goedemorgen Vicky" subtitle="Kleine stappen, grote resultaten.">
      <button className="week-hero" onClick={()=>setTab('checkin')}><span><b>Week {week}</b><small>{dateShort(a)} t/m {dateShort(b)}</small></span><ChevronRight/></button>
    </Hero>
    <div className="dashboard-section-title"><div><h2>Weekgemiddelden</h2><p>Alleen daadwerkelijk ingevulde dagen worden meegerekend.</p></div></div>
    <section className="kpis">
      <Kpi label="Gem. gewicht" value={`${fmt(latest?.weight)} kg`} change={delta(latest?.weight,prev?.weight,'kg')}/>
      <Kpi label="Gem. calorieën" value={Number.isFinite(latest?.calories)?`${Math.round(latest.calories).toLocaleString('nl-NL')} kcal`:'—'} change={delta(latest?.calories,prev?.calories,'kcal')}/>
      <Kpi label="Gem. kracht" value={Number.isFinite(latest?.strength)?`${fmt(latest.strength)} / 10`:'—'} change={delta(latest?.strength,prev?.strength,'')}/>
      <Kpi label="Gem. energie" value={Number.isFinite(latest?.energy)?`${fmt(latest.energy)} / 10`:'—'} change={delta(latest?.energy,prev?.energy,'')}/>
      <Kpi label="Gem. stress" value={Number.isFinite(latest?.stress)?`${fmt(latest.stress)} / 10`:'—'} change={delta(latest?.stress,prev?.stress,'')}/>
      <Kpi label="Gem. slaap" value={Number.isFinite(latest?.sleep)?`${fmt(latest.sleep)} uur`:'—'} change={delta(latest?.sleep,prev?.sleep,'uur')}/>
      <Kpi label="Gem. stappen" value={Number.isFinite(latest?.steps)?Math.round(latest.steps).toLocaleString('nl-NL'):'—'} change={delta(latest?.steps,prev?.steps,'')}/>
      <Kpi label="Navel (zondag)" value={Number.isFinite(latest?.navel)?`${fmt(latest.navel)} cm`:'—'} change={delta(latest?.navel,prev?.navel,'cm')}/>
      <Kpi label="Heup (zondag)" value={Number.isFinite(latest?.hip)?`${fmt(latest.hip)} cm`:'—'} change={delta(latest?.hip,prev?.hip,'cm')}/>
      <Kpi label="Huidige fase" value={phase.name} change={phase.kcal}/>
    </section>
    <section className="card chart-card large"><div className="card-head"><h2>Gewicht</h2><strong>{Number.isFinite(latest?.weight)&&Number.isFinite(firstWith('weight')?.weight)?delta(latest.weight,firstWith('weight').weight,'kg'):'—'}</strong></div><Chart data={weightData} suffix=" kg"/></section>
    <div className="chart-pair">
      <section className="card chart-card"><div className="card-head"><h2>Navelomvang</h2><strong>{delta(latest?.navel,firstWith('navel')?.navel,'cm')}</strong></div><Chart data={navelData} suffix=" cm"/></section>
      <section className="card chart-card"><div className="card-head"><h2>Heupomvang</h2><strong>{delta(latest?.hip,firstWith('hip')?.hip,'cm')}</strong></div><Chart data={hipData} suffix=" cm"/></section>
    </div>
    <section className="card chart-card"><div className="card-head"><h2>Calorieën (gem.)</h2><strong>{delta(latest?.calories,firstWith('calories')?.calories,'kcal')}</strong></div><BarViz data={kcalData}/></section>
    <section className="quote-card"><span>“CONSISTENCY CREATES CHANGE”</span><em>Same Girl.<br/>Stronger Mindset.</em></section>
  </>
}
function Kpi({label,value,change}){return <div className="kpi"><span>{label}</span><strong>{value}</strong><small>{change}</small></div>}
function Chart({data,suffix=''}){return <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:10,right:12,left:-18,bottom:0}}><CartesianGrid stroke="#eadfda" strokeDasharray="3 3"/><XAxis dataKey="week" tick={{fontSize:12,fill:'#7e706c'}}/><YAxis tick={{fontSize:12,fill:'#7e706c'}} domain={['dataMin - 1','dataMax + 1']}/><Tooltip formatter={v=>[`${String(v).replace('.',',')}${suffix}`,'']}/><Line type="monotone" dataKey="value" stroke="#bd6e7e" strokeWidth={3} dot={{r:4,fill:'#bd6e7e'}} activeDot={{r:6}}/></LineChart></ResponsiveContainer></div>}
function BarViz({data}){return <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:10,right:10,left:-18,bottom:0}}><CartesianGrid stroke="#eadfda" strokeDasharray="3 3"/><XAxis dataKey="week" tick={{fontSize:12,fill:'#7e706c'}}/><YAxis tick={{fontSize:12,fill:'#7e706c'}}/><Tooltip/><Bar dataKey="value" fill="#bd6e7e" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div>}
function WeekSelector({selected,setSelected,max,dates}){return <div className="week-select"><button onClick={()=>setSelected(Math.max(1,selected-1))}><ChevronLeft/></button><div><b>Week {selected}</b><small>{dateLong(dates[0])} — {dateLong(dates[1])}</small></div><button onClick={()=>setSelected(Math.min(max,selected+1))}><ChevronRight/></button></div>}
function DayForm({day,data,onChange,week,onWeek}){
  const fields=[['weight','Gewicht','kg','.1'],['calories','Calorieën (totaal)','kcal','1'],['strength','Kracht niveau (1-10)','','1'],['energy','Energie niveau (1-10)','','1'],['stress','Stress niveau (1-10)','','1'],['sleep','Slaap','uren','.1'],['steps','Stappen','','1']]
  return <section className="card day-form"><div className="day-form-head"><h2>{FULL_DAYS[day]}</h2><span>{day===6?'Zondagmeting':''}</span></div>{fields.map(([k,l,u,step])=><label className="field-row" key={k}><span>{l}</span><div className="input-wrap"><input type="number" step={step} min={['strength','energy','stress'].includes(k)?1:0} max={['strength','energy','stress'].includes(k)?10:undefined} value={data[k]} onChange={e=>onChange(k,e.target.value)} inputMode="decimal"/><small>{u}</small></div></label>)}{day===6&&<div className="sunday-box"><label className="field-row"><span>Omvang heup</span><div className="input-wrap"><input value={week.hip} onChange={e=>onWeek('hip',e.target.value)} inputMode="decimal"/><small>cm</small></div></label><label className="field-row"><span>Omvang navel</span><div className="input-wrap"><input value={week.navel} onChange={e=>onWeek('navel',e.target.value)} inputMode="decimal"/><small>cm</small></div></label></div>}</section>
}
function Progress({summaries}){return <><PageTitle title="Voortgang" sub="Week-op-week vergelijking over het hele traject."/><section className="card"><WeekTable summaries={summaries}/></section></>}
function WeekTable({summaries}){return <div className="table-wrap"><table><thead><tr><th>Week</th><th>Gewicht</th><th>Δ</th><th>Kcal</th><th>Kracht</th><th>Energie</th><th>Stress</th><th>Slaap</th><th>Stappen</th><th>Heup</th><th>Navel</th></tr></thead><tbody>{[...summaries].reverse().map((s,i,arr)=>{const prev=arr[i+1];return <tr key={s.week}><td><b>W{s.week}</b></td><td>{fmt(s.weight)}</td><td>{prev?delta(s.weight,prev.weight,'kg'):'—'}</td><td>{Number.isFinite(s.calories)?Math.round(s.calories):'—'}</td><td>{fmt(s.strength)}</td><td>{fmt(s.energy)}</td><td>{fmt(s.stress)}</td><td>{fmt(s.sleep)}</td><td>{Number.isFinite(s.steps)?Math.round(s.steps).toLocaleString('nl-NL'):'—'}</td><td>{fmt(s.hip)}</td><td>{fmt(s.navel)}</td></tr>})}</tbody></table></div>}
function HistoryPage({weeks,summaries,openWeek}){return <><PageTitle title="Historie" sub="Open een eerdere week om gegevens terug te zien of aan te passen."/><div className="history-list">{[...weeks].sort((a,b)=>b.week-a.week).map(w=>{const s=summaries.find(x=>x.week===w.week);const [a,b]=weekDates(w.week);return <button key={w.week} onClick={()=>openWeek(w.week)}><span><b>Week {w.week}</b><small>{dateShort(a)} — {dateShort(b)}</small></span><strong>{fmt(s?.weight)} kg</strong><ChevronRight/></button>})}</div></>}
function ExportPage({exportExcel}){return <><PageTitle title="Export" sub="Exporteer je voortgang naar Excel."/><section className="card export-card"><Download size={34}/><div><h2>Excel-export</h2><p>Weekoverzicht, dagdata en coachfeedback in één bestand.</p></div><button className="primary" onClick={exportExcel}>Exporteren naar Excel</button></section></>}
function CoachPage({week,current,onWeek,aiFeedback,busy}){return <><PageTitle title="Strong Vicky Coach" sub={`Eerlijke feedback op Week ${week}, zonder suikerlaag.`}/><section className="card coach-card"><div className="coach-icon"><Sparkles/></div><div><h2>Coachanalyse</h2><div className="coach-text">{current.coach||'Nog geen analyse voor deze week. Genereer feedback zodra de week voldoende gegevens bevat.'}</div><div className="actions"><button className="primary" onClick={aiFeedback} disabled={busy}>{busy?'Analyseren...':'Genereer coachfeedback'}</button><button className="secondary" onClick={()=>onWeek('coach','')}>Wis feedback</button></div></div></section></>}
function SettingsPage({cloudEnabled,user,email,setEmail,password,setPassword,confirmPassword,setConfirmPassword,authView,setAuthView,auth,resendConfirmation,syncCloud,syncState,lastSync,busy,msg}){
  const syncLabel = syncState==='syncing'?'Bezig met synchroniseren':syncState==='error'?'Synchronisatieprobleem':user?'Synchronisatie actief':'Inloggen vereist'
  const syncTime = lastSync ? lastSync.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}) : null
  return <><PageTitle title="Instellingen" sub="Account en synchronisatie tussen iPhone, iPad en Mac."/>
    <section className="card status-card"><h2>Verbindingsstatus</h2><Status label="Netlify app" ok/><Status label="Supabase cloud" ok={cloudEnabled}/><Status label="Account ingelogd" ok={Boolean(user)}/><Status label="Cloud synchronisatie" ok={Boolean(user)&&syncState!=='error'} text={syncTime?`${syncLabel} · ${syncTime}`:syncLabel}/><Status label="GPT Coach functie" ok/></section>
    <section className="card auth-card">
      {user ? <><div className="account-head"><div><h2>Account</h2><p>Ingelogd als <b>{user.email}</b>.</p></div><div className="cloud-badge"><Cloud size={17}/> Sync actief</div></div><p className="auth-help">Gebruik hetzelfde account op je iPhone, iPad en Mac. Je check-ins worden via Supabase gedeeld.</p><div className="actions"><button className="primary" disabled={busy||syncState==='syncing'} onClick={syncCloud}><Cloud size={18}/>{syncState==='syncing'?'Synchroniseren...':'Synchroniseer nu'}</button><button className="secondary" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/> Uitloggen</button></div></> : <>
        <div className="auth-switch"><button className={authView==='login'?'active':''} onClick={()=>setAuthView('login')}>Inloggen</button><button className={authView==='signup'?'active':''} onClick={()=>setAuthView('signup')}>Account maken</button></div>
        {authView==='forgot' ? <><h2>Wachtwoord vergeten</h2><p className="auth-help">Vul je e-mailadres in. Je ontvangt van Supabase een herstel-link.</p></> : authView==='reset' ? <><h2>Nieuw wachtwoord</h2><p className="auth-help">Kies een nieuw wachtwoord van minimaal 8 tekens.</p></> : <><h2>{authView==='signup'?'Nieuw Strong Vicky-account':'Welkom terug'}</h2><p className="auth-help">{authView==='signup'?'Na registratie ontvang je mogelijk eerst een bevestigingsmail.':'Log in met hetzelfde account op al je apparaten.'}</p></>}
        {authView!=='reset' && <label>E-mail<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="jouw@email.nl"/></label>}
        {authView!=='forgot' && <label>Wachtwoord<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete={authView==='login'?'current-password':'new-password'} placeholder="Minimaal 8 tekens"/></label>}
        {(authView==='signup'||authView==='reset') && <label>Herhaal wachtwoord<input value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} type="password" autoComplete="new-password"/></label>}
        <div className="actions">
          {authView==='login' && <><button className="primary" disabled={busy} onClick={()=>auth('login')}><LogIn size={18}/>{busy?'Bezig...':'Inloggen'}</button><button className="text-button" onClick={()=>setAuthView('forgot')}>Wachtwoord vergeten?</button></>}
          {authView==='signup' && <><button className="primary" disabled={busy} onClick={()=>auth('signup')}>{busy?'Bezig...':'Account maken'}</button><button className="text-button" onClick={resendConfirmation}>Bevestigingsmail opnieuw sturen</button></>}
          {authView==='forgot' && <><button className="primary" disabled={busy} onClick={()=>auth('forgot')}>Stuur herstelmail</button><button className="secondary" onClick={()=>setAuthView('login')}>Terug</button></>}
          {authView==='reset' && <button className="primary" disabled={busy} onClick={()=>auth('reset')}>Nieuw wachtwoord opslaan</button>}
        </div>
      </>}
      {msg && <div className="auth-message">{msg}</div>}
    </section>
  </>
}
function Status({label,ok,text}){return <div className="status-row"><CheckCircle2 className={ok?'ok':''}/><span><b>{label}</b><small>{text||(ok?'Gereed':'Nog configureren')}</small></span></div>}
function PageTitle({title,sub}){return <header className="page-title"><h1>{title}</h1><p>{sub}</p></header>}
