import React, { useEffect, useMemo, useState, useLayoutEffect } from "react";
import { Calendar, Clock, ListChecks, Plus, X, Moon, Sun, Trash2, Edit3, Maximize2, Minimize2, BarChart3, Settings } from "lucide-react";

// =============================================================
// Types
// =============================================================

type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon..Sun

type ClassItem = {
  id: string;
  name: string;
  color: string; // hex
  day: DayIndex; // 0..6 (Mon..Sun)
  start: string; // HH:mm
  end: string;   // HH:mm
};

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

type StudyHistoryEntry = {
  date: string; // YYYY-MM-DD
  minutes: number;
};

// =============================================================
// Constants & utils
// =============================================================

const DAYS: Record<DayIndex, string> = {
  0: "Mon",
  1: "Tue",
  2: "Wed",
  3: "Thu",
  4: "Fri",
  5: "Sat",
  6: "Sun",
};

const DAYS_TR: Record<DayIndex, string> = {
  0: "Pazartesi",
  1: "Salı",
  2: "Çarşamba",
  3: "Perşembe",
  4: "Cuma",
  5: "Cumartesi",
  6: "Pazar",
};

const COLORS = ["#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#ec4899"];

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const uid = () => Math.random().toString(36).slice(2, 9);

const dateKey = (d: Date) => d.toISOString().slice(0,10); // YYYY-MM-DD

function startOfWeekMonday(d: Date) {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7; // Mon=0
  out.setDate(out.getDate() - day);
  out.setHours(0,0,0,0);
  return out;
}

// =============================================================
// Storage helper
// =============================================================

const useLocal = <T,>(key: string, initial: T) => {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState] as const;
};

// =============================================================
// Root component
// =============================================================

export default function OAANext() {
  // DEFAULT LIGHT THEME (white)
  const [dark, setDark] = useLocal<boolean>("oaa_next_dark", false);
  const [tab, setTab] = useLocal<"overview" | "timetable" | "history">("oaa_next_tab", "overview");
  const [classes, setClasses] = useLocal<ClassItem[]>("oaa_next_classes", []);
  const [todos, setTodos] = useLocal<TodoItem[]>("oaa_next_todos", []);
  // NEW: study minutes per day { "YYYY-MM-DD": minutes }
  const [studyLog, setStudyLog] = useLocal<Record<string, number>>("oaa_next_studylog", {});
  const [goal] = useLocal<number>("oaa_next_goal", 300); // minutes

  // modals
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [tmp, setTmp] = useState<ClassItem>({ id: "", name: "", color: COLORS[0], day: 0, start: "19:00", end: "20:00" });

  // timetable fullscreen
  const [ttFull, setTtFull] = useState(false);
  // Ensure theme before paint
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark"); else root.classList.remove("dark");
  }, [dark]);
  useEffect(()=>{
    document.body.style.overflow = ttFull ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [ttFull]);

  // self-tests (do not modify existing; add more below)
  useEffect(() => {
    const tests = [] as string[];
    if (toMin("00:30") !== 30) tests.push("toMin failed");
    if (fromMin(150) !== "02:30") tests.push("fromMin failed");
    if (clamp(5, 0, 4) !== 4) tests.push("clamp failed");
    // extra tests
    if (dateKey(new Date()).length !== 10) tests.push("dateKey format");
    if (fromMin(toMin("23:59")) !== "23:59") tests.push("roundtrip time conv");
    if (clamp(-10, 0, 1) !== 0 || clamp(10, 0, 1) !== 1) tests.push("clamp bounds");
    if (tests.length) console.warn("[OAA self-tests] ", tests);
  }, []);

  // -------------------------------------------
  // Time context
  // -------------------------------------------
  const now = new Date();
  const dayIndex: DayIndex = (((now.getDay() + 6) % 7) as DayIndex); // Mon=0
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(now);

  const todayClasses = useMemo(() => classes.filter(c => c.day === dayIndex).sort((a,b)=>a.start.localeCompare(b.start)), [classes, dayIndex]);

  const current = useMemo(() => todayClasses.find(c => minsNow >= toMin(c.start) && minsNow < toMin(c.end)), [todayClasses, minsNow]);
  const next = useMemo(() => {
    const sameDayUpcoming = todayClasses.filter(c => toMin(c.start) > minsNow);
    if (sameDayUpcoming[0]) return sameDayUpcoming[0];
    const tomorrow: DayIndex = (((dayIndex + 1) % 7) as DayIndex);
    const tmr = classes.filter(c => c.day === tomorrow).sort((a,b)=>a.start.localeCompare(b.start))[0];
    return tmr || null;
  }, [classes, todayClasses, minsNow, dayIndex]);

  // Right-now progress
  const progress = useMemo(() => {
    if (!current) return 0;
    const total = toMin(current.end) - toMin(current.start);
    const elapsed = clamp(minsNow - toMin(current.start), 0, total);
    return total === 0 ? 0 : Math.round((elapsed / total) * 100);
  }, [current, minsNow]);

  // Tomorrow list (first 6)
  const tomorrowList = useMemo(() => {
    const tomorrow: DayIndex = (((dayIndex + 1) % 7) as DayIndex);
    return classes
      .filter(c => c.day === tomorrow)
      .sort((a,b)=>a.start.localeCompare(b.start))
      .slice(0, 6);
  }, [classes, dayIndex]);

  // Manual study tracking (minutes)
  const todayMinutes = studyLog[todayKey] || 0;
  const setTodayMinutes = (m: number) => setStudyLog(prev => ({ ...prev, [todayKey]: Math.max(0, Math.min(24*60, Math.round(m))) }));

  const weekLabels = Object.values(DAYS);
  const weeklyMinutes = useMemo(() => {
    const mon = startOfWeekMonday(now);
    const out: number[] = [0,0,0,0,0,0,0];
    for (let i=0;i<7;i++){
      const d = new Date(mon);
      d.setDate(mon.getDate()+i);
      const k = dateKey(d);
      out[i] = studyLog[k] || 0;
    }
    return out;
  }, [studyLog, now]);

  // weekly stats


  // -------------------------------------------
  // Todo operations
  // -------------------------------------------
  const addTodo = (text: string) => setTodos(prev => [...prev, { id: uid(), text, done: false }]);
  const toggleTodo = (id: string) => setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)));
  const removeTodo = (id: string) => setTodos(prev => prev.filter(t => t.id !== id));

  // -------------------------------------------
  // Class CRUD
  // -------------------------------------------
  const openCreate = () => {
    setEditing(null);
    setTmp({ id: "", name: "", color: COLORS[0], day: 0, start: "19:00", end: "20:00" });
    setShowClassModal(true);
  };

  const openEdit = (cls: ClassItem) => {
    setEditing(cls);
    setTmp({ ...cls });
    setShowClassModal(true);
  };

  const saveClass = () => {
    if (!tmp.name.trim()) return;
    if (toMin(tmp.end) <= toMin(tmp.start)) return alert("Bitiş saati başlangıçtan sonra olmalı");
    if (editing) {
      setClasses(prev => prev.map(c => (c.id === editing.id ? { ...tmp, id: editing.id } : c)));
    } else {
      setClasses(prev => [...prev, { ...tmp, id: uid() }]);
    }
    setShowClassModal(false);
  };

  const deleteClass = (id: string) => setClasses(prev => prev.filter(c => c.id !== id));

  // -------------------------------------------
  // Layout
  // -------------------------------------------

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-zinc-950/60 bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            <span className="font-semibold">OAA Next</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTab("overview")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "overview" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}>Overview</button>
            <button onClick={() => setTab("timetable")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "timetable" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}>Timetable</button>
            <button onClick={() => setTab("history")} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "history" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}>Geçmiş</button>
            <button onClick={() => setShowSettingsModal(true)} className="ml-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" title="Ayarlar">
              <Settings className="w-5 h-5"/>
            </button>
            <button onClick={() => setDark(!dark)} className="ml-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" title="Tema">
              {dark ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-3">
          <Sidebar
            tab={tab}
            setTab={setTab}
            todos={todos}
            addTodo={addTodo}
            toggleTodo={toggleTodo}
            removeTodo={removeTodo}
          />
        </div>

        {/* Main column */}
        <section className="col-span-12 lg:col-span-9">
          {tab === "overview" ? (
            <Overview
              todayClasses={todayClasses}
              current={current}
              next={next}
              progress={progress}
              tomorrowList={tomorrowList}
              openCreate={openCreate}
              openEdit={openEdit}
              deleteClass={deleteClass}
              todayMinutes={todayMinutes}
              weeklyMinutes={weeklyMinutes}
              onSetTodayMinutes={setTodayMinutes}
              weekLabels={weekLabels}
              goal={goal}
              setGoal={setGoal}
            />
          ) : tab === "history" ? (
            <StudyHistory studyLog={studyLog} />
          ) : (
            <Timetable
              classes={classes}
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={deleteClass}
              fullscreen={ttFull}
              onToggleFull={()=>setTtFull(v=>!v)}
            />
          )}
        </section>
      </main>

      {showClassModal && (
        <Modal onClose={()=>setShowClassModal(false)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{editing ? "Dersi Düzenle" : "Yeni Ders Ekle"}</h3>
            <button className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>setShowClassModal(false)}><X className="w-5 h-5"/></button>
          </div>

          <div className="space-y-4">
            <label className="block">
              <div className="text-sm mb-1 text-zinc-500">Ders Adı</div>
              <input value={tmp.name} onChange={e=>setTmp(v=>({ ...v, name: e.target.value }))} className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400" placeholder="Matematik"/>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-sm mb-1 text-zinc-500">Gün</div>
                <select value={tmp.day} onChange={e=>setTmp(v=>({ ...v, day: Number(e.target.value) as DayIndex }))} className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
                  {Object.keys(DAYS_TR).map((k)=>{
                    const i = Number(k) as DayIndex; return <option key={k} value={k}>{DAYS_TR[i]}</option>;
                  })}
                </select>
              </label>

              <label className="block">
                <div className="text-sm mb-1 text-zinc-500">Renk</div>
                <div className="flex items-center gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={()=>setTmp(v=>({ ...v, color: c }))} className={`w-8 h-8 rounded-lg border ${tmp.color===c?"ring-2 ring-offset-2 ring-zinc-400 border-transparent":"border-zinc-200 dark:border-zinc-700"}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-sm mb-1 text-zinc-500">Başlangıç</div>
                <input type="time" value={tmp.start} onChange={e=>setTmp(v=>({ ...v, start: e.target.value }))} className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2" />
              </label>
              <label className="block">
                <div className="text-sm mb-1 text-zinc-500">Bitiş</div>
                <input type="time" value={tmp.end} onChange={e=>setTmp(v=>({ ...v, end: e.target.value }))} className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2" />
              </label>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={()=>setShowClassModal(false)} className="flex-1 h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">İptal</button>
            <button onClick={saveClass} className="flex-1 h-10 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">Kaydet</button>
          </div>
        </Modal>
      )}

      {showSettingsModal && (
        <Modal onClose={()=>setShowSettingsModal(false)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Ayarlar</h3>
            <button className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={()=>setShowSettingsModal(false)}><X className="w-5 h-5"/></button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
              <div className="text-sm font-semibold mb-2">Günlük Çalışma Hedefi</div>
              <div className="text-xs text-zinc-500 mb-3">Her gün için hedef çalışma sürenizi dakika cinsinden belirleyin</div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min={30} 
                  max={1440} 
                  step={30} 
                  value={goal} 
                  onChange={(e)=>setGoal(Number(e.target.value))} 
                  className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                />
                <span className="text-sm text-zinc-500">dakika</span>
              </div>
              <div className="mt-2 text-xs text-zinc-400">{(goal/60).toFixed(1)} saat</div>
            </div>
            
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
              <div className="text-sm font-semibold mb-2">Tema</div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDark(false)} 
                  className={`flex-1 px-3 py-2 rounded-lg border ${!dark ? "border-zinc-900 dark:border-white bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  Açık
                </button>
                <button 
                  onClick={() => setDark(true)} 
                  className={`flex-1 px-3 py-2 rounded-lg border ${dark ? "border-zinc-900 dark:border-white bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  Koyu
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
              <div className="text-sm font-semibold mb-2">Verileri Yönet</div>
              <div className="text-xs text-zinc-500 mb-3">Tüm verilerinizi yedekleyin veya farklı bir cihaza aktarın</div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const data = {
                      classes,
                      todos,
                      studyLog,
                      goal,
                      dark,
                      exportDate: new Date().toISOString()
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `oaa-backup-${dateKey(new Date())}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
                >
                  📥 Dışa Aktar
                </button>
                <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = (e: any) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event: any) => {
                          try {
                            const data = JSON.parse(event.target.result);
                            if (data.classes) setClasses(data.classes);
                            if (data.todos) setTodos(data.todos);
                            if (data.studyLog) setStudyLog(data.studyLog);
                            if (data.goal) setGoal(data.goal);
                            if (typeof data.dark === 'boolean') setDark(data.dark);
                            alert('Veriler başarıyla içe aktarıldı!');
                            setShowSettingsModal(false);
                          } catch (err) {
                            alert('Dosya okunamadı. Lütfen geçerli bir yedek dosyası seçin.');
                          }
                        };
                        reader.readAsText(file);
                      }
                    };
                    input.click();
                  }}
                  className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm font-medium"
                >
                  📤 İçe Aktar
                </button>
              </div>
              <div className="mt-2 text-xs text-zinc-400">Yedek dosyası tüm derslerinizi, görevlerinizi ve çalışma geçmişinizi içerir</div>
            </div>
          </div>

          <div className="mt-5">
            <button onClick={()=>setShowSettingsModal(false)} className="w-full h-10 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">Tamam</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =============================================================
// Overview page
// =============================================================

function Overview({ todayClasses, current, next, progress, tomorrowList, openCreate, openEdit, deleteClass, todayMinutes, weeklyMinutes, onSetTodayMinutes, weekLabels, goal, setGoal }: {
  todayClasses: ClassItem[];
  current: ClassItem | undefined;
  next: ClassItem | null | undefined;
  progress: number;
  tomorrowList: ClassItem[];
  openCreate: () => void;
  openEdit: (c: ClassItem) => void;
  deleteClass: (id: string) => void;
  todayMinutes: number;
  weeklyMinutes: number[];
  onSetTodayMinutes: (m: number) => void;
  weekLabels: string[];
  goal: number;
  setGoal: (g: number) => void;
}) {
  const [inputHours, setInputHours] = useState(Math.round((todayMinutes/60)*100)/100);

  useEffect(()=>{ setInputHours(Math.round((todayMinutes/60)*100)/100); }, [todayMinutes]);

  // Get today's date formatted
  const todayDate = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, []);

  return (
    <div className="space-y-6">
      {/* TOP ROW: Big Daily Study Widget spanning 2 columns + Weekly Graph */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* LARGE Günlük çalışma widget - now takes 2 columns */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 p-8 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1">{todayDate}</div>
          <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Bugün Kaç Saat Çalıştın?</h2>
          
          <div className="flex items-end gap-4 mb-8">
            <div>
              <div className="text-6xl font-bold">{Math.floor(todayMinutes/60)}</div>
              <div className="text-lg text-zinc-500">saat</div>
            </div>
            <div className="pb-2">
              <div className="text-4xl font-bold text-zinc-400">{todayMinutes%60}</div>
              <div className="text-sm text-zinc-500">dakika</div>
            </div>
          </div>
          
          {/* BIG Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-500">Günlük İlerleme</span>
              <span className="text-sm font-semibold">{Math.min(100, Math.round((todayMinutes/goal)*100))}%</span>
            </div>
            <div className="h-4 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500" 
                style={{ 
                  width: `${Math.min(100, (todayMinutes/goal)*100)}%`, 
                  background: "linear-gradient(to right, #3b82f6, #06b6d4, #22c55e)" 
                }} 
              />
            </div>
            <div className="text-xs text-zinc-400 mt-1">Hedef: {(goal/60).toFixed(1)} saat</div>
          </div>

          {/* Input area */}
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <input 
              type="number" 
              step={0.25} 
              min={0} 
              max={24} 
              value={inputHours}
              onChange={(e)=> setInputHours(Number(e.target.value))}
              className="flex-1 text-2xl font-bold rounded-lg border-2 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="0"
            />
            <span className="text-lg text-zinc-500 font-medium">saat</span>
            <button 
              onClick={()=> onSetTodayMinutes(inputHours*60)} 
              className="px-6 py-3 rounded-xl text-base font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg"
            >
              Kaydet
            </button>
          </div>
        </div>

        {/* Haftalık grafik - now takes 1 column */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-2"><div className="text-sm text-zinc-500">Haftalık Grafik</div></div>
          <BarMini values={weeklyMinutes} labels={weekLabels} max={Math.max(60, ...weeklyMinutes, 1)} />
          <div className="mt-2 text-xs text-zinc-500">Toplam: {(weeklyMinutes.reduce((a,b)=>a+b,0)/60).toFixed(1)}s • En uzun gün: {DAYS_TR[longestDay(weeklyMinutes)]}</div>
        </div>
      </div>

      {/* Sonraki ders */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="text-sm text-zinc-500 mb-3">Sonraki Ders</div>
        {next ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 rounded" style={{ background: next.color }} />
              <div>
                <div className="font-semibold text-lg">{next.name}</div>
                <div className="text-sm text-zinc-500">{next.start} – {next.end}</div>
              </div>
            </div>
            <button onClick={openCreate} className="px-3 py-2 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700">Ders Ekle</button>
          </div>
        ) : <div className="text-sm text-zinc-500">Yakında ders görünmüyor.</div>}
      </div>

      {/* RIGHT NOW + Quick stats */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 font-semibold"><Clock className="w-5 h-5"/> Right now</div>
            <button onClick={openCreate} className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"><Plus className="w-4 h-4"/> Ders</button>
          </div>
          {current ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-lg" style={{ color: current.color }}>{current.name}</div>
                <div className="text-sm text-zinc-500">{current.start} – {current.end}</div>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: current.color }} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Şu anda ders yok.</div>
          )}
        </div>

        {/* Quick stats */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-sm text-zinc-500 mb-2">Kısa İstatistikler</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500">Bugün</div>
              <div className="text-lg font-semibold">{(todayMinutes/60).toFixed(1)}s</div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500">Bu Hafta</div>
              <div className="text-lg font-semibold">{(weeklyMinutes.reduce((a,b)=>a+b,0)/60).toFixed(1)}s</div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-500">Ders Sayısı</div>
              <div className="text-lg font-semibold">{todayClasses.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Next + Today list */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-center gap-2 font-semibold mb-3"><Calendar className="w-5 h-5"/> Today</div>
          <div className="space-y-2">
            {todayClasses.length === 0 && <div className="text-sm text-zinc-500">Bugün program boş.</div>}
            {todayClasses.map(c => (
              <div key={c.id} onDoubleClick={()=>openEdit(c)}>
                <ClassRow c={c} onEdit={()=>openEdit(c)} onDelete={()=>deleteClass(c.id)} />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-center gap-2 font-semibold mb-3"><Calendar className="w-5 h-5"/> Tomorrow</div>
          <div className="space-y-2">
            {tomorrowList.length === 0 && <div className="text-sm text-zinc-500">Yarın görünmüyor.</div>}
            {tomorrowList.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-xl px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60" onDoubleClick={()=>openEdit(c)}>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-6 rounded" style={{ background: c.color }} />
                  <div className="text-sm font-medium">{c.name}</div>
                </div>
                <div className="text-xs text-zinc-500">{c.start} – {c.end}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Study History page with graphs
// =============================================================

function StudyHistory({ studyLog }: { studyLog: Record<string, number> }) {
  const [period, setPeriod] = useState<"7days" | "1month" | "3months">("7days");
  
  const historyData = useMemo(() => {
    const now = new Date();
    const entries: StudyHistoryEntry[] = [];
    
    let days = 7;
    if (period === "1month") days = 30;
    if (period === "3months") days = 90;
    
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = dateKey(d);
      entries.push({
        date: key,
        minutes: studyLog[key] || 0
      });
    }
    
    return entries;
  }, [studyLog, period]);
  
  const stats = useMemo(() => {
    const total = historyData.reduce((sum, entry) => sum + entry.minutes, 0);
    const avg = historyData.length > 0 ? total / historyData.length : 0;
    const max = Math.max(...historyData.map(e => e.minutes), 0);
    const daysWorked = historyData.filter(e => e.minutes > 0).length;
    
    return { total, avg, max, daysWorked };
  }, [historyData]);
  
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Çalışma Geçmişi</h2>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPeriod("7days")} 
              className={`px-3 py-1.5 rounded-lg text-sm ${period === "7days" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
            >
              7 Gün
            </button>
            <button 
              onClick={() => setPeriod("1month")} 
              className={`px-3 py-1.5 rounded-lg text-sm ${period === "1month" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
            >
              1 Ay
            </button>
            <button 
              onClick={() => setPeriod("3months")} 
              className={`px-3 py-1.5 rounded-lg text-sm ${period === "3months" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
            >
              3 Ay
            </button>
          </div>
        </div>
        
        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <div className="text-xs text-zinc-500 mb-1">Toplam Çalışma</div>
            <div className="text-2xl font-bold">{(stats.total / 60).toFixed(1)} <span className="text-sm">saat</span></div>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <div className="text-xs text-zinc-500 mb-1">Ortalama/Gün</div>
            <div className="text-2xl font-bold">{(stats.avg / 60).toFixed(1)} <span className="text-sm">saat</span></div>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <div className="text-xs text-zinc-500 mb-1">En Uzun Gün</div>
            <div className="text-2xl font-bold">{(stats.max / 60).toFixed(1)} <span className="text-sm">saat</span></div>
          </div>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <div className="text-xs text-zinc-500 mb-1">Çalışılan Gün</div>
            <div className="text-2xl font-bold">{stats.daysWorked} <span className="text-sm">gün</span></div>
          </div>
        </div>
        
        {/* Bar chart */}
        <div className="mt-6">
          <HistoryBarChart data={historyData} period={period} />
        </div>
      </div>
      
      {/* Detailed list */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h3 className="text-lg font-semibold mb-4">Detaylı Liste</h3>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {historyData.slice().reverse().map(entry => (
            <div 
              key={entry.date} 
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60"
            >
              <div>
                <div className="text-sm font-medium">{formatDate(entry.date)}</div>
                <div className="text-xs text-zinc-500">{getDayName(entry.date)}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">{Math.floor(entry.minutes / 60)}s {entry.minutes % 60}dk</div>
                <div className="text-xs text-zinc-500">{entry.minutes} dakika</div>
              </div>
            </div>
          ))}
          {historyData.length === 0 && (
            <div className="text-center text-zinc-500 py-8">Henüz veri yok</div>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryBarChart({ data, period }: { data: StudyHistoryEntry[]; period: string }) {
  const maxValue = Math.max(...data.map(d => d.minutes), 60);
  
  // For display optimization
  const displayData = period === "3months" 
    ? data.filter((_, i) => i % 3 === 0) // Show every 3rd day for 3 months
    : period === "1month"
    ? data.filter((_, i) => i % 2 === 0) // Show every 2nd day for 1 month
    : data; // Show all for 7 days
  
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end justify-between gap-1 h-64 min-w-full px-2">
        {displayData.map((entry, i) => {
          const height = maxValue > 0 ? (entry.minutes / maxValue) * 100 : 0;
          // Ensure minimum visible height for non-zero values
          const displayHeight = entry.minutes > 0 ? Math.max(height, 8) : 0;
          
          return (
            <div key={entry.date} className="flex-1 flex flex-col items-center gap-2 min-w-[30px] max-w-[80px]">
              <div 
                className="w-full rounded-t-lg transition-all cursor-pointer relative group min-h-[8px]"
                style={{ 
                  height: `${displayHeight}%`,
                  background: entry.minutes > 0 
                    ? 'linear-gradient(to top, #3b82f6, #06b6d4, #22c55e)' 
                    : '#e4e4e7'
                }}
                title={`${formatDate(entry.date)}: ${(entry.minutes / 60).toFixed(1)} saat`}
              >
                {entry.minutes > 0 && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    {(entry.minutes / 60).toFixed(1)}s
                  </div>
                )}
              </div>
              <div className="text-[10px] text-zinc-500 text-center font-medium">
                {period === "7days" ? getDayShort(entry.date) : formatDateShort(entry.date)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function getDayName(dateStr: string) {
  const d = new Date(dateStr);
  const dayIndex = (d.getDay() + 6) % 7;
  return DAYS_TR[dayIndex as DayIndex];
}

function getDayShort(dateStr: string) {
  const d = new Date(dateStr);
  const dayIndex = (d.getDay() + 6) % 7;
  return DAYS[dayIndex as DayIndex];
}

function longestDay(arr: number[]): DayIndex {
  let best = 0 as DayIndex; let bestV = -1;
  for (let i=0;i<arr.length;i++){ if (arr[i] > bestV){ best = i as DayIndex; bestV = arr[i]; } }
  return best;
}

function ClassRow({ c, onEdit, onDelete }: { c: ClassItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-center justify-between rounded-xl px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60" onDoubleClick={onEdit}>
      <div className="flex items-center gap-3">
        <div className="w-2 h-6 rounded" style={{ background: c.color }} />
        <div>
          <div className="text-sm font-medium">{c.name}</div>
          <div className="text-xs text-zinc-500">{DAYS_TR[c.day]} • {c.start} – {c.end}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"><Edit3 className="w-4 h-4"/></button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"><Trash2 className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

// =============================================================
// Timetable page (full‑screen grid) - FIXED OVERLAPPING ISSUE
// =============================================================

function Timetable({ classes, onCreate, onEdit, onDelete, fullscreen=false, onToggleFull }: {
  classes: ClassItem[];
  onCreate: () => void;
  onEdit: (c: ClassItem) => void;
  onDelete: (id: string) => void;
  fullscreen?: boolean;
  onToggleFull?: () => void;
}) {
  // FIXED: Dynamic start/end hours based on classes
  const minClassHour = useMemo(() => {
    if (classes.length === 0) return 6;
    const allStarts = classes.map(c => Math.floor(toMin(c.start) / 60));
    return Math.max(0, Math.min(...allStarts, 6));
  }, [classes]);
  
  const maxClassHour = useMemo(() => {
    if (classes.length === 0) return 24;
    const allEnds = classes.map(c => Math.ceil(toMin(c.end) / 60));
    return Math.min(24, Math.max(...allEnds, 18) + 1);
  }, [classes]);
  
  const startHour = minClassHour; // Start from earliest class or 6 AM
  const endHour = maxClassHour;    // End at latest class + 1 hour or midnight
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const byDay: Record<DayIndex, ClassItem[]> = { 0:[],1:[],2:[],3:[],4:[],5:[],6:[] };
  classes.forEach(c => { byDay[c.day].push(c); });
  (Object.keys(byDay) as unknown as DayIndex[]).forEach((d) => byDay[d].sort((a,b)=>a.start.localeCompare(b.start)));

  const dayCols: DayIndex[] = [0,1,2,3,4,5,6];

  const timePos = (hhmm: string) => {
    const mins = toMin(hhmm) - startHour*60;
    const total = (endHour - startHour) * 60;
    return clamp((mins / total) * 100, 0, 100);
  };

  const blockHeight = (s: string, e: string) => {
    const H = ((toMin(e) - toMin(s)) / ((endHour-startHour)*60)) * 100;
    return Math.max(H, 2);
  };

  // FIXED: Detect overlapping classes and position them side-by-side
  const getOverlapLayout = (dayClasses: ClassItem[]) => {
    const layout: Record<string, { width: number; left: number }> = {};
    
    // Sort by start time
    const sorted = [...dayClasses].sort((a, b) => toMin(a.start) - toMin(b.start));
    
    // Group overlapping classes
    const groups: ClassItem[][] = [];
    sorted.forEach(cls => {
      let placed = false;
      for (const group of groups) {
        // Check if this class overlaps with any in the group
        const overlaps = group.some(g => 
          toMin(cls.start) < toMin(g.end) && toMin(cls.end) > toMin(g.start)
        );
        if (overlaps) {
          group.push(cls);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push([cls]);
      }
    });
    
    // Calculate layout for each group
    groups.forEach(group => {
      const count = group.length;
      group.forEach((cls, idx) => {
        layout[cls.id] = {
          width: 100 / count,
          left: (100 / count) * idx
        };
      });
    });
    
    return layout;
  };

  // Red line for now
  const now = new Date();
  const nowM = now.getHours()*60 + now.getMinutes();
  const nowTop = clamp(((nowM - startHour*60) / ((endHour-startHour)*60)) * 100, 0, 100);

  const Outer = ({children}:{children: React.ReactNode}) => (
    fullscreen ? (
      <div className="fixed inset-0 z-40 p-4 bg-zinc-100 dark:bg-zinc-950">
        {children}
      </div>
    ) : (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        {children}
      </div>
    )
  );

  return (
    <Outer>
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="text-xl font-semibold">Haftalık Ders Programı</div>
        <div className="flex items-center gap-2">
          <button onClick={onCreate} className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"><Plus className="w-4 h-4"/> Ders Ekle</button>
          <button onClick={onToggleFull} className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700">
            {fullscreen ? (<><Minimize2 className="w-4 h-4"/>Küçült</>) : (<><Maximize2 className="w-4 h-4"/>Tam ekran</>)}
          </button>
        </div>
      </div>

      <div className={fullscreen ? "h-[calc(100vh-110px)] overflow-auto" : "max-h-[70vh] overflow-auto"}>
        <div className="min-w-[900px]">
          {/* Head */}
          <div className="grid grid-cols-8 gap-2 mb-2 px-1">
            <div className="text-center text-xs font-semibold text-zinc-500">Saat</div>
            {dayCols.map(d => (
              <div key={d} className="text-center text-sm font-semibold bg-zinc-50 dark:bg-zinc-800/60 rounded-lg py-2">{DAYS_TR[d]}</div>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-2 relative">
            {/* Hour ruler */}
            <div className="space-y-0">
              {hours.map(h => (
                <div key={h} className="h-24 text-xs text-zinc-500 flex items-start justify-center pt-1">{String(h).padStart(2,"0")}:00</div>
              ))}
            </div>

            {/* Columns */}
            {dayCols.map((d) => {
              const dayClasses = byDay[d];
              const layout = getOverlapLayout(dayClasses);
              
              return (
                <div key={d} className="relative border-l border-zinc-200 dark:border-zinc-800">
                  {/* grid lines */}
                  {hours.map(h => (
                    <div key={h} className="h-24 border-b border-dashed border-zinc-200 dark:border-zinc-800" />
                  ))}

                  {/* Now line */}
                  {d === (((now.getDay()+6)%7) as DayIndex) && (
                    <div className="absolute left-0 right-0 h-0.5 bg-red-500/80 z-20" style={{ top: `${nowTop}%` }}>
                      <div className="absolute -left-1 -top-1 w-2 h-2 bg-red-500 rounded-full" />
                    </div>
                  )}

                  {/* Blocks - FIXED for overlapping with minimum height */}
                  {dayClasses.map(c => {
                    const pos = layout[c.id] || { width: 100, left: 0 };
                    const calculatedHeight = blockHeight(c.start, c.end);
                    // Minimum 60px height for readability
                    const minHeightPx = 60;
                    const containerHeightPx = (endHour - startHour) * 96; // 96px per hour (h-24 = 6rem = 96px)
                    const minHeightPercent = (minHeightPx / containerHeightPx) * 100;
                    const finalHeight = Math.max(calculatedHeight, minHeightPercent);
                    
                    return (
                      <div 
                        key={c.id} 
                        onDoubleClick={()=>onEdit(c)} 
                        className="absolute rounded-xl text-white text-xs sm:text-sm font-medium shadow-md hover:shadow-lg transition cursor-pointer z-10 overflow-hidden"
                        style={{ 
                          top: `${timePos(c.start)}%`, 
                          height: `${finalHeight}%`, 
                          background: c.color,
                          left: `${pos.left}%`,
                          width: `${pos.width}%`,
                          minHeight: '60px'
                        }}
                      >
                        <div className="p-2.5 h-full flex flex-col">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="font-semibold leading-tight truncate flex-1">{c.name}</div>
                            <div className="flex items-center gap-1 opacity-0 hover:opacity-100 flex-shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); onEdit(c); }} className="bg-white/20 rounded p-1 hover:bg-white/30"><Edit3 className="w-3 h-3"/></button>
                              <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="bg-white/20 rounded p-1 hover:bg-white/30"><X className="w-3 h-3"/></button>
                            </div>
                          </div>
                          <div className="text-[11px] opacity-90 mt-auto">{c.start} – {c.end}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!fullscreen && <div className="mt-3 text-xs text-zinc-500">Zaman çizelgesi {startHour}:00 - {endHour}:00 arası gösterilmektedir. Derslerinize göre otomatik ölçeklenir.</div>}
    </Outer>
  );
}

// =============================================================
// Small components
// =============================================================

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function TodoComposer({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e)=>{ e.preventDefault(); if(v.trim()){ onAdd(v.trim()); setV(""); } }} className="flex items-center gap-2">
      <input value={v} onChange={e=>setV(e.target.value)} placeholder="Yeni görev..." className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400"/>
      <button className="h-9 px-3 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-medium"><Plus className="w-4 h-4"/></button>
    </form>
  );
}

function Sidebar({ tab, setTab, todos, addTodo, toggleTodo, removeTodo }: {
  tab: "overview" | "timetable" | "history";
  setTab: (t: any) => void;
  todos: TodoItem[];
  addTodo: (t: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}){
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 text-sm font-semibold">Menü</div>
      <nav className="p-2 space-y-1">
        <NavItem label="Overview" active={tab==='overview'} onClick={()=>setTab('overview')}/>
        <NavItem label="Timetable" active={tab==='timetable'} onClick={()=>setTab('timetable')}/>
        <NavItem label="Geçmiş" active={tab==='history'} onClick={()=>setTab('history')}/>
      </nav>
      <div className="px-3 pb-3 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-sm font-semibold flex items-center gap-2"><ListChecks className="w-4 h-4"/> To‑Do</div>
      <div className="p-3 space-y-2">
        <TodoComposer onAdd={addTodo} />
        <div className="space-y-1 max-h-56 overflow-auto pr-1">
          {todos.length === 0 && (<div className="text-sm text-zinc-500">Henüz görev yok.</div>)}
          {todos.map(t => (
            <div key={t.id} className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <input type="checkbox" checked={t.done} onChange={()=>toggleTodo(t.id)} className="accent-zinc-900 dark:accent-white w-4 h-4" />
              <span className={`flex-1 text-sm ${t.done ? "line-through text-zinc-400" : ""}`}>{t.text}</span>
              <button onClick={()=>removeTodo(t.id)} className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"><Trash2 className="w-4 h-4"/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active?: boolean; onClick?: ()=>void }){
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${active? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900':'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
      <span>{label}</span>
    </button>
  );
}

function BarMini({ values, labels, max }: { values: number[]; labels: string[]; max: number }){
  return (
    <div className="flex items-end gap-2 h-28">
      {values.map((v,i)=>{
        const h = Math.round(((v) / Math.max(1, max)) * 100);
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-500 to-cyan-400" style={{ height: `${h}%` }} />
            <div className="text-[10px] text-zinc-500">{labels[i][0]}</div>
          </div>
        );
      })}
    </div>
  );
}
