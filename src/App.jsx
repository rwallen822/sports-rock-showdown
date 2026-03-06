import { useState, useRef, useEffect, useCallback } from "react";

const uid = () => Math.random().toString(36).slice(2);

// 1960s MLB Classic Palette
const C = {
  cream:    "#F5F0E8",
  parchment:"#EDE5D0",
  navy:     "#1B3A6B",
  red:      "#C41E3A",
  forest:   "#1D5C2E",
  gold:     "#C8972B",
  sky:      "#4A7FB5",
  brown:    "#5C3D1E",
  chalk:    "#FFFFFF",
  ink:      "#1A1A1A",
  steel:    "#6B7A8D",
  ltblue:   "#D6E4F0",
  ltred:    "#F5DDE0",
  ltgreen:  "#D6EBD9",
  ltgold:   "#FAF0D6",
  ltnav:    "#D6DFF0",
};

const PLAYER_COLORS = [C.navy, C.red, C.forest, C.gold, C.brown, C.sky, "#7B3FA0", "#2A8C6E"];
const BANK_KEY = "srs_bank_v1";
const SAVES_KEY = "srs_saves_v1";

const calcScore = (marks) => {
  if (!marks) return 0;
  const { sport, artist, yearExact, yearClose, grandSlam } = marks;
  const pts = (sport?1:0)+(artist?1:0)+(yearExact?1:yearClose?1:0);
  return pts + (sport&&artist&&yearExact?1:0) + (grandSlam?1:0);
};

const scoreColor = (s) => s>=5?C.gold:s===4?C.gold:s===3?C.forest:s===2?C.navy:s===1?C.steel:C.parchment;

function storageGet(key) {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

function storageSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch { return false; }
}

// -- iTunes Search API --
async function searchItunes(query, limit = 15) {
  if (!query || query.length < 2) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(t => ({
      trackId: t.trackId,
      song: t.trackName,
      artist: t.artistName,
      album: t.collectionName,
      year: t.releaseDate ? new Date(t.releaseDate).getFullYear().toString() : "",
      artworkUrl: t.artworkUrl100?.replace("100x100", "200x200") || "",
      artworkSmall: t.artworkUrl60 || "",
      previewUrl: t.previewUrl || "",
      appleMusicUrl: t.trackViewUrl || "",
    }));
  } catch { return []; }
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// -- Global audio player (singleton so only one preview plays at a time) --
function useAudioPlayer() {
  const audioRef = useRef(null);
  const [playingUrl, setPlayingUrl] = useState(null);

  const play = useCallback((url) => {
    if (!url) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingUrl === url) {
      setPlayingUrl(null);
      return;
    }
    const a = new Audio(url);
    a.onended = () => setPlayingUrl(null);
    a.onerror = () => setPlayingUrl(null);
    a.play();
    audioRef.current = a;
    setPlayingUrl(url);
  }, [playingUrl]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingUrl(null);
  }, []);

  return { playingUrl, play, stop };
}

export default function App() {
  const [view, setView] = useState("setup");
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState("");
  const [quarters, setQuarters] = useState({1:[],2:[],3:[],4:[]});
  const [sportsBank, setSportsBank] = useState([]);
  const [musicBank, setMusicBank] = useState([]);
  const [modal, setModal] = useState(null);
  const [formData, setFormData] = useState({});
  const [scores, setScores] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const dragRef = useRef(null);
  const [saveSlots, setSaveSlots] = useState({});
  const [saveStatus, setSaveStatus] = useState("");
  const [currentSlot, setCurrentSlot] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [newSlotName, setNewSlotName] = useState("");
  const [activeQ, setActiveQ] = useState(1);
  const autoSaveTimer = useRef(null);
  const audio = useAudioPlayer();

  useEffect(() => {
    const bank = storageGet(BANK_KEY);
    if (bank) {
      if (bank.sports) setSportsBank(bank.sports);
      if (bank.music) setMusicBank(bank.music);
    }
    const saves = storageGet(SAVES_KEY);
    if (saves) setSaveSlots(saves);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    storageSet(BANK_KEY, { sports: sportsBank, music: musicBank });
  }, [sportsBank, musicBank, storageReady]);

  useEffect(() => {
    if (!storageReady || !currentSlot) return;
    clearTimeout(autoSaveTimer.current);
    setSaveStatus("saving");
    autoSaveTimer.current = setTimeout(() => {
      const gameState = { players, quarters, scores, name: currentSlot, savedAt: new Date().toISOString() };
      const updated = { ...saveSlots, [currentSlot]: gameState };
      setSaveSlots(updated);
      storageSet(SAVES_KEY, updated);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2500);
    }, 1200);
  }, [players, quarters, scores]);

  const saveToSlot = (name) => {
    setSaveStatus("saving");
    const gameState = { players, quarters, scores, name, savedAt: new Date().toISOString() };
    const updated = { ...saveSlots, [name]: gameState };
    setSaveSlots(updated);
    storageSet(SAVES_KEY, updated);
    setCurrentSlot(name);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(""), 2500);
  };

  const loadSlot = (name) => {
    const s = saveSlots[name];
    if (!s) return;
    setPlayers(s.players || []);
    setQuarters(s.quarters || {1:[],2:[],3:[],4:[]});
    setScores(s.scores || {});
    setCurrentSlot(name);
    setModal(null);
    setView("game");
  };

  const deleteSlot = (name) => {
    const updated = { ...saveSlots };
    delete updated[name];
    setSaveSlots(updated);
    storageSet(SAVES_KEY, updated);
    if (currentSlot === name) setCurrentSlot(null);
  };

  const startNewGame = (name) => {
    if (!name.trim()) return;
    setCurrentSlot(name.trim());
    setScores({});
    setQuarters({1:[],2:[],3:[],4:[]});
    setModal(null);
    setView("game");
  };

  const addPlayer = () => {
    const n = newName.trim();
    if (!n) return;
    setPlayers(p => [...p, { id: uid(), name: n, color: PLAYER_COLORS[p.length % PLAYER_COLORS.length] }]);
    setNewName("");
  };

  const saveItem = () => {
    const isSport = modal.type === "addSport" || modal.type === "editSport";
    const isEdit = modal.type === "editSport" || modal.type === "editMusic";
    const setter = isSport ? setSportsBank : setMusicBank;
    if (isEdit) setter(b => b.map(x => x.id === formData.id ? { ...formData } : x));
    else setter(b => [...b, { ...formData, id: uid() }]);
    setModal(null);
  };

  const addMusicFromSearch = (track) => {
    setMusicBank(b => [...b, { ...track, id: uid() }]);
  };

  const sendToQuarter = (item, bankType, qId) => {
    setQuarters(prev => ({
      ...prev,
      [qId]: [...prev[qId], { ...item, bankType }],
    }));
    if (view === "game") setActiveQ(qId);
  };

  // IDs of items already placed on the game board
  const placedIds = new Set(
    [1,2,3,4].flatMap(q => quarters[q]).map(item => item.id)
  );

  const handleDrop = (toQ, toIdx) => {
    if (!dragRef.current) return;
    const { source, item, fromQ, fromIdx } = dragRef.current;
    setQuarters(prev => {
      const next = { 1:[...prev[1]], 2:[...prev[2]], 3:[...prev[3]], 4:[...prev[4]] };
      if (source === "quarter") {
        next[fromQ].splice(fromIdx, 1);
        next[toQ].splice(toIdx, 0, item);
      } else {
        const ins = toIdx !== undefined ? toIdx : next[toQ].length;
        next[toQ].splice(ins, 0, { ...item, bankType: source });
      }
      return next;
    });
    setDragOver(null);
    dragRef.current = null;
  };

  const toggleMark = (pid, qId, idx, field) => {
    const key = `${qId}_${idx}`;
    setScores(prev => {
      const pm = { ...(prev[pid] || {}) };
      const qm = { ...(pm[key] || {}) };
      if (field === "year") {
        if (!qm.yearClose && !qm.yearExact) { qm.yearClose = true; qm.yearExact = false; }
        else if (qm.yearClose && !qm.yearExact) { qm.yearClose = false; qm.yearExact = true; }
        else { qm.yearClose = false; qm.yearExact = false; }
      } else { qm[field] = !qm[field]; }
      pm[key] = qm;
      return { ...prev, [pid]: pm };
    });
  };

  const getTotal = (pid) => Object.values(scores[pid] || {}).reduce((s, m) => s + calcScore(m), 0);
  const totalPoss = [1,2,3,4].flatMap(q => quarters[q]).length * 5;
  const slotCount = Object.keys(saveSlots).length;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", background: C.cream, minHeight: "100vh", color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${C.parchment}; }
        ::-webkit-scrollbar-thumb { background: ${C.steel}; border-radius: 3px; }
        .hov:hover { filter: brightness(0.93); cursor: pointer; transition: filter .15s; }
        input, textarea, select { font-family: 'Nunito', sans-serif; outline: none; }
        input::placeholder, textarea::placeholder { color: #B0A898; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .tab-btn { transition: background .15s, color .15s; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* HEADER */}
      <div style={{ background: C.navy, borderBottom: `4px solid ${C.gold}`, padding: "0 24px", display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 900, fontSize: 20, color: C.gold, letterSpacing: 2, marginRight: 24, padding: "14px 0", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          ⚡ Sports Rock Showdown
        </div>

        {[["setup","👥 Players"],["game","🎮 Game"],["bank","📦 Bank"]].map(([v, label]) => (
          <button key={v} className="tab-btn" onClick={() => setView(v)} style={{
            background: view === v ? C.gold : "transparent",
            border: "none",
            color: view === v ? C.navy : "#A8BCD4",
            padding: "14px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700,
            fontFamily: "'Nunito',sans-serif", letterSpacing: 0.5,
          }}>
            {label}
          </button>
        ))}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 16 }}>
          <button onClick={() => setModal({ type: "saves" })} className="hov" style={{ background: "#2A5298", border: "1px solid #4A72B8", color: "#A8BCD4", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'Nunito',sans-serif" }}>
            💾 {slotCount > 0 ? `${slotCount} Save${slotCount !== 1 ? "s" : ""}` : "Saves"}
          </button>
          {currentSlot && (
            <button onClick={() => saveToSlot(currentSlot)} className="hov" style={{ background: "#1D5C2E", border: "1px solid #2E7A40", color: "#7ED4A0", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'Nunito',sans-serif" }}>
              💾 Save
            </button>
          )}
          {saveStatus && (
            <span style={{ fontSize: 11, fontWeight: 700, color: saveStatus === "saving" ? C.gold : "#7ED4A0", animation: saveStatus === "saving" ? "pulse 1s infinite" : "none" }}>
              {saveStatus === "saving" ? "Saving…" : "✓ Saved"}
            </span>
          )}
          {currentSlot && <span style={{ fontSize: 10, color: "#6A8AB0", fontWeight: 600 }}>{currentSlot}</span>}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 18, alignItems: "center", paddingRight: 4 }}>
          {players.map(p => (
            <div key={p.id} style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 20, color: p.color === C.navy ? C.gold : p.color === C.cream ? C.ink : C.cream, lineHeight: 1 }}>{getTotal(p.id)}</div>
              <div style={{ fontSize: 9, color: "#7A9ABE", fontWeight: 700, letterSpacing: 1, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name.toUpperCase()}</div>
            </div>
          ))}
          {players.length > 0 && <div style={{ fontSize: 10, color: "#5A7A9A", fontWeight: 600 }}>/{totalPoss}</div>}
        </div>
      </div>

      {/* SETUP */}
      {view === "setup" && (
        <div style={{ maxWidth: 520, margin: "48px auto", padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ background: C.navy, color: C.gold, display: "inline-block", padding: "8px 32px", borderRadius: 4, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 36, letterSpacing: 3, textTransform: "uppercase", lineHeight: 1 }}>Players</div>
            </div>
            <div style={{ fontSize: 12, color: C.steel, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Add contestants to get started</div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()} placeholder="Player name…"
              style={{ ...IS, flex: 1, fontSize: 15, fontWeight: 600 }} />
            <Btn onClick={addPlayer} v="navy">+ Add</Btn>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
            {players.map((p, i) => (
              <div key={p.id} style={{ background: C.chalk, border: `2px solid ${p.color}`, borderRadius: 10, padding: "11px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: p.color === C.gold ? C.navy : C.cream, fontWeight: 900, fontSize: 16 }}>{i + 1}</div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{p.name}</span>
                </div>
                <button onClick={() => setPlayers(pl => pl.filter(x => x.id !== p.id))} className="hov" style={{ background: C.ltred, border: `1px solid ${C.red}`, color: C.red, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>

          {players.length >= 2 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <Btn onClick={() => { setCurrentSlot(null); setView("game"); }} v="navy" lg>🎮 Open Game Board →</Btn>
              <Btn onClick={() => setModal({ type: "newGame" })} v="ghost">📁 Save to a named slot first</Btn>
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: 12, color: C.steel, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Add at least 2 players</div>
          )}
        </div>
      )}

      {/* BANK */}
      {view === "bank" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "calc(100vh - 58px)" }}>
          <BankCol title="🏆 Sports Questions" color={C.navy} accent={C.ltblue} items={sportsBank} type="sport"
            onAdd={() => { setFormData({}); setModal({ type: "addSport" }); }}
            onEdit={item => { setFormData({ ...item }); setModal({ type: "editSport" }); }}
            onDelete={id => setSportsBank(b => b.filter(x => x.id !== id))}
            onDragStart={item => { dragRef.current = { source: "sport", item }; }}
            audio={audio} onSendToQuarter={sendToQuarter} placedIds={placedIds} />
          <BankCol title="🎵 Music" color={C.red} accent={C.ltred} items={musicBank} type="music"
            onAdd={() => { setFormData({}); setModal({ type: "addMusic" }); }}
            onEdit={item => { setFormData({ ...item }); setModal({ type: "editMusic" }); }}
            onDelete={id => setMusicBank(b => b.filter(x => x.id !== id))}
            onDragStart={item => { dragRef.current = { source: "music", item }; }}
            borderLeft audio={audio} onSendToQuarter={sendToQuarter} placedIds={placedIds} />
        </div>
      )}

      {/* GAME */}
      {view === "game" && (
        <div style={{ display: "flex", height: "calc(100vh - 58px)" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {/* Quarter Tabs */}
            <div style={{ display: "flex", gap: 0, background: C.parchment, borderBottom: `3px solid ${C.parchment}` }}>
              {[1,2,3,4].map(qId => {
                const qc = QColors[qId];
                const active = activeQ === qId;
                return (
                  <button key={qId} onClick={() => setActiveQ(qId)} className="hov" style={{
                    flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
                    background: active ? qc.bg : C.cream,
                    color: active ? (qc.bg === C.gold ? C.navy : C.chalk) : qc.bg,
                    fontWeight: 900, fontSize: 13, letterSpacing: 1, textTransform: "uppercase",
                    borderBottom: active ? `3px solid ${qc.bg}` : "3px solid transparent",
                    fontFamily: "inherit", transition: "all .15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    {qc.label}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                      background: active ? "rgba(255,255,255,0.2)" : qc.lt, color: active ? (qc.bg === C.gold ? C.navy : C.chalk) : qc.bg,
                    }}>{quarters[qId].length}</span>
                  </button>
                );
              })}
            </div>
            {/* Active Quarter Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              <QuarterBlock key={activeQ} qId={activeQ} items={quarters[activeQ]} players={players} scores={scores}
                toggleMark={toggleMark} calcScore={calcScore} scoreColor={scoreColor}
                dragRef={dragRef} dragOver={dragOver} setDragOver={setDragOver} handleDrop={handleDrop}
                audio={audio}
                onRemove={idx => {
                  setQuarters(prev => { const n = { ...prev, [activeQ]: [...prev[activeQ]] }; n[activeQ].splice(idx, 1); return n; });
                }} />
            </div>
          </div>
          <div style={{ width: 270, borderLeft: `3px solid ${C.parchment}`, background: C.cream, overflowY: "auto" }}>
            <Scoreboard players={players} getTotal={getTotal} totalPoss={totalPoss} scores={scores} quarters={quarters} calcScore={calcScore} />
            <MiniBank label="🏆 Sports" color={C.navy} bg={C.ltblue} items={sportsBank} placedIds={placedIds} onDragStart={item => { dragRef.current = { source: "sport", item }; }} audio={audio} onSendToQuarter={sendToQuarter} bankType="sport" />
            <MiniBank label="🎵 Music" color={C.red} bg={C.ltred} items={musicBank} placedIds={placedIds} onDragStart={item => { dragRef.current = { source: "music", item }; }} audio={audio} onSendToQuarter={sendToQuarter} bankType="music" />
          </div>
        </div>
      )}

      {/* MODALS */}
      {modal && (
        <div onClick={() => { setModal(null); audio.stop(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.chalk, borderRadius: 14, padding: 28, width: "min(600px,95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.25)", border: `3px solid ${C.navy}` }}>

            {modal.type === "saves" && (
              <SavesModal saveSlots={saveSlots} loadSlot={loadSlot} deleteSlot={deleteSlot}
                startNewGame={startNewGame} currentSlot={currentSlot}
                onSaveCurrent={() => { if (currentSlot) saveToSlot(currentSlot); else setModal({ type: "newGame" }); }}
                onClose={() => setModal(null)} />
            )}

            {modal.type === "newGame" && (
              <div>
                <SectionHead color={C.navy}>Name This Game</SectionHead>
                <FField label="Game / Session Name" val={newSlotName} set={setNewSlotName} ph="e.g. Game Night Jan 2026…" />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                  <Btn onClick={() => setModal(null)} v="ghost">Cancel</Btn>
                  <Btn onClick={() => { saveToSlot(newSlotName.trim()); setModal(null); setNewSlotName(""); }} v="navy">Save & Continue</Btn>
                </div>
              </div>
            )}

            {(modal.type === "addSport" || modal.type === "editSport") && (
              <div>
                <SectionHead color={C.navy}>{modal.type === "editSport" ? "Edit" : "Add"} Sports Question</SectionHead>
                <FField label="Sport / Category" val={formData.sport || ""} set={v => setFormData({ ...formData, sport: v })} ph="Baseball, NBA, NFL…" />
                <FField label="Question" val={formData.question || ""} set={v => setFormData({ ...formData, question: v })} ph="The trivia question…" multi />
                <FField label="Correct Answer" val={formData.answer || ""} set={v => setFormData({ ...formData, answer: v })} ph="Answer…" />
                <FField label="Notes" val={formData.notes || ""} set={v => setFormData({ ...formData, notes: v })} ph="Difficulty, source, context…" />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                  <Btn onClick={() => setModal(null)} v="ghost">Cancel</Btn>
                  <Btn onClick={saveItem} v="navy">Save Question</Btn>
                </div>
              </div>
            )}

            {modal.type === "addMusic" && (
              <MusicSearchModal
                onAdd={addMusicFromSearch}
                onClose={() => setModal(null)}
                audio={audio}
              />
            )}

            {modal.type === "editMusic" && (
              <div>
                <SectionHead color={C.red}>Edit Music</SectionHead>
                {formData.artworkUrl && (
                  <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                    <img src={formData.artworkUrl} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontStyle: "italic" }}>{formData.song}</div>
                      <div style={{ fontSize: 13, color: C.red, fontWeight: 700 }}>{formData.artist}</div>
                      <div style={{ fontSize: 12, color: C.brown }}>{formData.album} ({formData.year})</div>
                    </div>
                  </div>
                )}
                <FField label="Song Title" val={formData.song || ""} set={v => setFormData({ ...formData, song: v })} ph="Song name…" />
                <FField label="Artist" val={formData.artist || ""} set={v => setFormData({ ...formData, artist: v })} ph="Artist / band name…" />
                <FField label="Year" val={formData.year || ""} set={v => setFormData({ ...formData, year: v })} ph="e.g. 1994" />
                <FField label="Notes" val={formData.notes || ""} set={v => setFormData({ ...formData, notes: v })} ph="Chart peak, context…" />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                  <Btn onClick={() => setModal(null)} v="ghost">Cancel</Btn>
                  <Btn onClick={saveItem} v="red">Save Music</Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -- Music Search Modal (iTunes) --
function MusicSearchModal({ onAdd, onClose, audio }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(new Set());
  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    searchItunes(debouncedQuery).then(r => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleAdd = (track) => {
    onAdd(track);
    setAdded(s => new Set([...s, track.trackId]));
  };

  return (
    <div>
      <SectionHead color={C.red}>🎵 Add Music from Apple Music</SectionHead>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search songs, artists, albums…"
          autoFocus
          style={{ ...IS, width: "100%", fontSize: 15, fontWeight: 600, paddingRight: 40 }}
        />
        {loading && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, border: `2px solid ${C.parchment}`, borderTopColor: C.red, borderRadius: "50%", animation: "spin .6s linear infinite" }} />
        )}
      </div>

      {results.length === 0 && !loading && query.length >= 2 && (
        <div style={{ textAlign: "center", padding: "24px 0", color: C.steel, fontSize: 13, fontWeight: 600 }}>No results found</div>
      )}
      {results.length === 0 && query.length < 2 && (
        <div style={{ textAlign: "center", padding: "24px 0", color: C.steel, fontSize: 13, fontWeight: 600 }}>
          Type a song name, artist, or album to search Apple Music
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
        {results.map(track => {
          const isAdded = added.has(track.trackId);
          const isPlaying = audio.playingUrl === track.previewUrl;
          return (
            <div key={track.trackId} style={{ display: "flex", gap: 10, alignItems: "center", background: isAdded ? C.ltgreen : C.parchment, border: `2px solid ${isAdded ? C.forest : "#CCC0A8"}`, borderRadius: 8, padding: "8px 10px", transition: "background .15s" }}>
              <div style={{ position: "relative", width: 50, height: 50, flexShrink: 0 }}>
                {track.artworkUrl ? (
                  <img src={track.artworkUrl} alt="" style={{ width: 50, height: 50, borderRadius: 6, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 50, height: 50, borderRadius: 6, background: C.ltred, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎵</div>
                )}
                {track.previewUrl && (
                  <button onClick={() => audio.play(track.previewUrl)} style={{
                    position: "absolute", inset: 0, background: isPlaying ? "rgba(196,30,58,0.85)" : "rgba(0,0,0,0.4)",
                    border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: isPlaying ? 1 : 0, transition: "opacity .15s",
                    color: C.chalk, fontSize: 18,
                  }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => { if (!isPlaying) e.currentTarget.style.opacity = 0; }}>
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.song}</div>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>{track.artist}</div>
                <div style={{ fontSize: 10, color: C.steel, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.album} · {track.year}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button onClick={() => handleAdd(track)} disabled={isAdded} className={isAdded ? "" : "hov"} style={{
                  background: isAdded ? C.forest : C.red, color: C.chalk, border: "none", borderRadius: 5,
                  padding: "4px 10px", cursor: isAdded ? "default" : "pointer", fontSize: 10, fontWeight: 800,
                  fontFamily: "'Nunito',sans-serif", opacity: isAdded ? 0.7 : 1,
                }}>
                  {isAdded ? "✓ Added" : "+ Add"}
                </button>
                {track.appleMusicUrl && (
                  <AppleMusicLink url={track.appleMusicUrl} small />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <div style={{ fontSize: 10, color: C.steel, fontWeight: 600 }}>
          Powered by iTunes Search API · 30s previews
        </div>
        <Btn onClick={() => { audio.stop(); onClose(); }} v="ghost">Done</Btn>
      </div>
    </div>
  );
}

// -- Apple Music Link Button --
function AppleMusicLink({ url, small }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="hov" style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: "#FC3C44", color: C.chalk, borderRadius: small ? 4 : 5,
      padding: small ? "2px 7px" : "3px 9px", textDecoration: "none",
      fontSize: small ? 9 : 10, fontWeight: 800, fontFamily: "'Nunito',sans-serif",
      letterSpacing: 0.3, lineHeight: 1.4,
    }}>
      ♫ Apple Music
    </a>
  );
}

// -- Preview Play Button (inline, for cards) --
function PreviewBtn({ url, audio, size = 22 }) {
  if (!url) return null;
  const isPlaying = audio.playingUrl === url;
  return (
    <button onClick={(e) => { e.stopPropagation(); audio.play(url); }} className="hov" style={{
      width: size, height: size, borderRadius: "50%", border: "none",
      background: isPlaying ? C.red : C.navy, color: C.chalk,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", fontSize: size * 0.45, flexShrink: 0, padding: 0,
    }}>
      {isPlaying ? "⏸" : "▶"}
    </button>
  );
}

// -- Saves Modal --
function SavesModal({ saveSlots, loadSlot, deleteSlot, startNewGame, currentSlot, onSaveCurrent, onClose }) {
  const [newName, setNewName] = useState("");
  const slots = Object.values(saveSlots).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  const fmt = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };
  return (
    <div>
      <SectionHead color={C.navy}>💾 Saved Games</SectionHead>
      <p style={{ fontSize: 12, color: C.steel, marginBottom: 18, marginTop: -8 }}>Your question bank saves automatically. Game sessions save per slot.</p>

      {currentSlot && (
        <div style={{ background: C.ltblue, border: `2px solid ${C.navy}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.navy, fontWeight: 800, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>Current Game</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: C.navy, fontSize: 15, fontWeight: 700 }}>{currentSlot}</span>
            <Btn onClick={onSaveCurrent} v="navy">💾 Save Now</Btn>
          </div>
        </div>
      )}

      <div style={{ background: C.parchment, border: "1px solid #CCC0A8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.brown, fontWeight: 800, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Start New Game Session</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && newName.trim() && startNewGame(newName)} placeholder="Game name…" style={{ ...IS, flex: 1 }} />
          <Btn onClick={() => { if (newName.trim()) startNewGame(newName); }} v="forest">Start</Btn>
        </div>
      </div>

      {slots.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: C.steel, fontSize: 13, fontWeight: 600 }}>No saved games yet</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slots.map(s => (
          <div key={s.name} style={{ background: s.name === currentSlot ? C.ltblue : C.parchment, border: `2px solid ${s.name === currentSlot ? C.navy : "#CCC0A8"}`, borderRadius: 8, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, color: C.navy, fontWeight: 700, marginBottom: 2 }}>
                {s.name} {s.name === currentSlot && <span style={{ fontSize: 10, color: C.forest, fontWeight: 800, background: C.ltgreen, padding: "1px 6px", borderRadius: 10 }}>ACTIVE</span>}
              </div>
              <div style={{ fontSize: 11, color: C.steel }}>
                {(s.players || []).map(p => p.name).join(", ")} · {fmt(s.savedAt)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn onClick={() => loadSlot(s.name)} v="ghost">Load</Btn>
              <Btn onClick={() => deleteSlot(s.name)} v="red-ghost">✕</Btn>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <Btn onClick={onClose} v="ghost">Close</Btn>
      </div>
    </div>
  );
}

// -- Bank Column --
function BankCol({ title, color, accent, items, type, onAdd, onEdit, onDelete, onDragStart, borderLeft, audio, onSendToQuarter, placedIds }) {
  const bankType = type === "sport" ? "sport" : "music";
  return (
    <div style={{ display: "flex", flexDirection: "column", borderLeft: borderLeft ? `3px solid ${C.parchment}` : "none", background: C.cream }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: `3px solid ${color}`, background: color, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: color === C.navy ? C.gold : C.chalk, letterSpacing: 1 }}>{title}</div>
          <div style={{ fontSize: 10, color: color === C.navy ? "#A8C8E8" : "#F0C0C8", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{items.length} items · drag to board or send to quarter</div>
        </div>
        <Btn onClick={onAdd} v={type === "sport" ? "gold" : "chalk"}> + Add {type === "sport" ? "Sport Q" : "Music"}</Btn>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
        {items.length === 0 && <div style={{ textAlign: "center", padding: "48px 0", color: C.steel, fontSize: 13, fontWeight: 600 }}>None yet — click Add to get started</div>}
        {items.map(item => {
          const isPlaced = placedIds && placedIds.has(item.id);
          return (
            <div key={item.id} draggable onDragStart={() => onDragStart(item)} className="hov"
              style={{ background: isPlaced ? C.ltgreen : C.chalk, border: `2px solid ${color}`, borderLeft: `5px solid ${color}`, borderRadius: 8, padding: "10px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", opacity: isPlaced ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
                  {type === "music" && item.artworkSmall && (
                    <img src={item.artworkSmall} alt="" style={{ width: 42, height: 42, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {type === "sport" ? (
                      <>
                        {item.sport && <div style={{ fontSize: 10, color: C.gold, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{item.sport}</div>}
                        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.4, marginBottom: 4, fontWeight: 600 }}>{item.question || "—"}</div>
                        <div style={{ fontSize: 11, color: C.forest, fontWeight: 700 }}>✓ {item.answer || "—"}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: C.ink, marginBottom: 2, fontWeight: 700, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.song || "—"}</div>
                        <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>🎤 {item.artist || "—"}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: C.brown, fontWeight: 600 }}>📅 {item.year || "—"}</span>
                          <PreviewBtn url={item.previewUrl} audio={audio} size={20} />
                          <AppleMusicLink url={item.appleMusicUrl} small />
                        </div>
                      </>
                    )}
                    {item.notes && <div style={{ fontSize: 10, color: C.steel, marginTop: 4, fontStyle: "italic" }}>{item.notes}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <SmBtn onClick={() => onEdit(item)}>✏️</SmBtn>
                    <SmBtn onClick={() => onDelete(item.id)} danger>✕</SmBtn>
                  </div>
                  {onSendToQuarter && !isPlaced && (
                    <QuarterPicker onSelect={(qId) => onSendToQuarter(item, bankType, qId)} />
                  )}
                  {isPlaced && <div style={{ fontSize: 9, color: C.forest, fontWeight: 800, letterSpacing: 0.5 }}>ON BOARD</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Quarter Picker (send to Q1-Q4 buttons) --
function QuarterPicker({ onSelect }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1,2,3,4].map(qId => {
        const qc = QColors[qId];
        return (
          <button key={qId} onClick={() => onSelect(qId)} className="hov" style={{
            background: qc.bg, color: qc.bg === C.gold ? C.navy : C.chalk,
            border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer",
            fontSize: 9, fontWeight: 800, fontFamily: "'Nunito',sans-serif",
          }}>
            Q{qId}
          </button>
        );
      })}
    </div>
  );
}

// -- Quarter Block --
const QColors = {
  1: { bg: C.navy,  lt: C.ltblue,  label: "1st Quarter" },
  2: { bg: C.red,   lt: C.ltred,   label: "2nd Quarter" },
  3: { bg: C.forest,lt: C.ltgreen, label: "3rd Quarter" },
  4: { bg: C.gold,  lt: C.ltgold,  label: "4th Quarter" },
};

function QuarterBlock({ qId, items, players, scores, toggleMark, calcScore, scoreColor, dragRef, dragOver, setDragOver, handleDrop, onRemove, audio }) {
  const qc = QColors[qId];
  const isOver = dragOver === `zone_${qId}`;
  return (
    <div style={{ background: C.chalk, border: `2px solid ${qc.bg}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ background: qc.bg, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: qc.bg === C.gold ? C.navy : C.chalk, letterSpacing: 1, textTransform: "uppercase" }}>{qc.label}</div>
        <div style={{ fontSize: 10, color: qc.bg === C.gold ? C.navy : "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{items.length} questions</div>
      </div>
      <div onDragOver={e => { e.preventDefault(); setDragOver(`zone_${qId}`); }}
        onDrop={e => { e.preventDefault(); handleDrop(qId, items.length); setDragOver(null); }}
        style={{ padding: "10px 12px", minHeight: 60, display: "flex", flexDirection: "column", gap: 8, background: isOver ? qc.lt : C.chalk, transition: "background .15s" }}>
        {items.length === 0 && <div style={{ textAlign: "center", padding: "14px 0", color: C.steel, fontSize: 12, fontWeight: 600 }}>Drag sports & music cards here from the bank →</div>}
        {items.map((item, idx) => (
          <GameCard key={`${item.id}_${idx}`} item={item} idx={idx} qId={qId} qc={qc} players={players} scores={scores}
            toggleMark={toggleMark} calcScore={calcScore} scoreColor={scoreColor}
            dragRef={dragRef} dragOver={dragOver} setDragOver={setDragOver} handleDrop={handleDrop} onRemove={() => onRemove(idx)} audio={audio} />
        ))}
      </div>
    </div>
  );
}

// -- Game Card --
function GameCard({ item, idx, qId, qc, players, scores, toggleMark, calcScore, scoreColor, dragRef, dragOver, setDragOver, handleDrop, onRemove, audio }) {
  const isSport = item.bankType === "sport";
  const isOver = dragOver === `card_${qId}_${idx}`;
  const typeColor = isSport ? C.navy : C.red;
  const typeBg = isSport ? C.ltblue : C.ltred;
  return (
    <div draggable
      onDragStart={() => { dragRef.current = { source: "quarter", item, fromQ: qId, fromIdx: idx }; }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(`card_${qId}_${idx}`); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDrop(qId, idx); }}
      onDragEnd={() => setDragOver(null)}
      style={{ background: isOver ? C.parchment : C.chalk, border: `2px solid ${isOver ? qc.bg : "#DDD5C0"}`, borderLeft: `5px solid ${typeColor}`, borderRadius: 8, cursor: "grab", transition: "background .12s", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", borderBottom: `1px solid ${C.parchment}`, background: typeBg }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: typeColor, letterSpacing: 0.5, textTransform: "uppercase" }}>{isSport ? "🏆 Sport" : "🎵 Music"}</span>
          <span style={{ fontSize: 10, color: C.steel, fontWeight: 600 }}>#{idx + 1}</span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {!isSport && item.previewUrl && <PreviewBtn url={item.previewUrl} audio={audio} size={20} />}
          {!isSport && item.appleMusicUrl && <AppleMusicLink url={item.appleMusicUrl} small />}
          <button onClick={onRemove} className="hov" style={{ background: "none", border: "none", color: C.steel, cursor: "pointer", fontSize: 12, padding: "1px 4px", fontWeight: 700 }}>✕</button>
        </div>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", gap: 8 }}>
        {!isSport && item.artworkSmall && (
          <img src={item.artworkSmall} alt="" style={{ width: 38, height: 38, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          {isSport ? (
            <>
              {item.sport && <div style={{ fontSize: 9, color: C.gold, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{item.sport}</div>}
              <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.4, marginBottom: 2, fontWeight: 600 }}>{item.question || "—"}</div>
              <div style={{ fontSize: 11, color: C.forest, fontWeight: 700 }}>✓ {item.answer || "—"}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.ink, fontWeight: 700, fontStyle: "italic", marginBottom: 1 }}>{item.song || "—"}</div>
              <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>🎤 {item.artist || "—"}</div>
              <div style={{ fontSize: 11, color: C.brown, fontWeight: 600 }}>📅 {item.year || "—"}</div>
            </>
          )}
        </div>
      </div>
      {players.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.parchment}`, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 5, background: "#FAFAF6" }}>
          {players.map(p => {
            const key = `${qId}_${idx}`;
            const m = (scores[p.id] || {})[key] || {};
            const pts = calcScore(m);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 64, fontSize: 10, color: p.color, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{p.name}</div>
                {isSport ? (
                  <MkBtn active={m.sport} color={C.navy} onClick={() => toggleMark(p.id, qId, idx, "sport")} label="Sport" />
                ) : (
                  <>
                    <MkBtn active={m.artist} color={C.red} onClick={() => toggleMark(p.id, qId, idx, "artist")} label="Artist" />
                    <YrBtn marks={m} onClick={() => toggleMark(p.id, qId, idx, "year")} />
                    <MkBtn active={m.grandSlam} color={C.gold} onClick={() => toggleMark(p.id, qId, idx, "grandSlam")} label="GS" />
                  </>
                )}
                <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 900, color: scoreColor(pts), minWidth: 18, textAlign: "right" }}>
                  {pts > 0 ? (pts >= 5 ? "★+" : pts === 4 ? "★" : pts) : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- Scoreboard --
function Scoreboard({ players, getTotal, totalPoss, scores, quarters, calcScore }) {
  const sorted = [...players].sort((a, b) => getTotal(b.id) - getTotal(a.id));
  return (
    <div style={{ padding: 14, borderBottom: `2px solid ${C.parchment}`, background: C.cream }}>
      <div style={{ fontWeight: 900, fontSize: 14, color: C.navy, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase", borderBottom: `2px solid ${C.navy}`, paddingBottom: 6 }}>Scoreboard</div>
      {sorted.map((p, i) => {
        const t = getTotal(p.id);
        const pct = totalPoss > 0 ? (t / totalPoss) * 100 : 0;
        return (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {i === 0 && players.length > 1 && <span style={{ fontSize: 11 }}>🥇</span>}
                <span style={{ fontSize: 13, color: p.color, fontWeight: 800 }}>{p.name}</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: 18, color: p.color }}>{t}</span>
            </div>
            <div style={{ height: 5, background: C.parchment, borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: p.color, borderRadius: 3, transition: "width .4s" }} />
            </div>
          </div>
        );
      })}
      {players.length === 0 && <div style={{ fontSize: 12, color: C.steel, fontWeight: 600 }}>Add players in Setup tab</div>}
      {players.length > 0 && [1,2,3,4].some(q => quarters[q].length > 0) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.steel, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>By Quarter</div>
          {[1,2,3,4].map(qId => {
            if (quarters[qId].length === 0) return null;
            const qc = QColors[qId];
            return (
              <div key={qId} style={{ marginBottom: 5, display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: qc.bg === C.gold ? C.brown : qc.bg, background: qc.lt, padding: "2px 6px", borderRadius: 4, minWidth: 22, textAlign: "center" }}>Q{qId}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {players.map(p => {
                    const qs = quarters[qId].reduce((s, _, idx) => s + calcScore((scores[p.id] || {})[`${qId}_${idx}`] || {}), 0);
                    return <div key={p.id} style={{ fontSize: 10, color: p.color, fontWeight: 700 }}>{p.name.split(" ")[0]}: {qs}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- Mini Bank --
function MiniBank({ label, color, bg, items, onDragStart, audio, placedIds, onSendToQuarter, bankType }) {
  const [expanded, setExpanded] = useState(false);
  const available = items.filter(item => !placedIds || !placedIds.has(item.id));
  const display = expanded ? available : available.slice(0, 5);
  const hasMore = available.length > 5;

  return (
    <div style={{ padding: "12px 13px", borderBottom: `2px solid ${C.parchment}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <div style={{ fontSize: 11, color, fontWeight: 800, letterSpacing: 0.5 }}>
          {label} ({available.length}/{items.length}) — drag or send to board
        </div>
        {hasMore && (
          <button onClick={() => setExpanded(!expanded)} className="hov" style={{
            background: "transparent", border: `1px solid ${color}`, color, borderRadius: 4,
            padding: "1px 7px", cursor: "pointer", fontSize: 9, fontWeight: 800, fontFamily: "'Nunito',sans-serif",
          }}>
            {expanded ? "Collapse" : `Show All (${available.length})`}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: expanded ? 400 : "none", overflowY: expanded ? "auto" : "visible" }}>
        {display.map(item => (
          <div key={item.id} draggable onDragStart={() => onDragStart(item)} className="hov"
            style={{ background: bg, border: `1px solid ${color}`, borderRadius: 5, padding: "5px 9px", cursor: "grab", fontSize: 10, color: C.ink, fontWeight: 600, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6 }}>
            {label.includes("Music") && item.artworkSmall && (
              <img src={item.artworkSmall} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label.includes("Sport") ? (item.question?.slice(0, 44) || "…") : `${item.artist || "?"} — ${item.song?.slice(0, 24) || "?"}`}
            </span>
            {label.includes("Music") && item.previewUrl && <PreviewBtn url={item.previewUrl} audio={audio} size={18} />}
            {onSendToQuarter && (
              <QuarterPicker onSelect={(qId) => onSendToQuarter(item, bankType, qId)} />
            )}
          </div>
        ))}
        {available.length === 0 && items.length > 0 && <div style={{ fontSize: 11, color: C.steel, fontWeight: 600 }}>All items placed on the board</div>}
        {items.length === 0 && <div style={{ fontSize: 11, color: C.steel, fontWeight: 600 }}>None — add in Bank tab</div>}
      </div>
    </div>
  );
}

// -- Shared --
function MkBtn({ active, color, onClick, label }) {
  return (
    <button onClick={onClick} style={{ background: active ? color : C.parchment, border: `2px solid ${color}`, color: active ? C.chalk : color, borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9, fontWeight: 800, fontFamily: "'Nunito',sans-serif", transition: "all .1s" }}>
      {active ? "✓" : "○"} {label}
    </button>
  );
}

function YrBtn({ marks, onClick }) {
  const { yearClose, yearExact } = marks;
  const [label, bg, border, color] =
    yearExact ? ["EXACT ★", C.gold, C.gold, C.navy] :
    yearClose ? ["± 1 YR", C.forest, C.forest, C.chalk] :
    ["Year", C.parchment, C.steel, C.steel];
  return (
    <button onClick={onClick} style={{ background: bg, border: `2px solid ${border}`, color, borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9, fontWeight: 800, fontFamily: "'Nunito',sans-serif", transition: "all .1s" }}>
      {label}
    </button>
  );
}

function Btn({ onClick, children, v = "ghost", lg }) {
  const vs = {
    navy:       { background: C.navy, color: C.gold, border: `2px solid ${C.navy}` },
    red:        { background: C.red, color: C.chalk, border: `2px solid ${C.red}` },
    forest:     { background: C.forest, color: C.chalk, border: `2px solid ${C.forest}` },
    gold:       { background: C.gold, color: C.navy, border: `2px solid ${C.gold}` },
    chalk:      { background: C.chalk, color: C.navy, border: `2px solid ${C.chalk}` },
    ghost:      { background: "transparent", color: C.steel, border: "2px solid #CCC0A8" },
    "red-ghost":{ background: "transparent", color: C.red, border: `2px solid ${C.red}` },
  };
  return (
    <button onClick={onClick} className="hov" style={{ ...vs[v], borderRadius: 7, padding: lg ? "11px 26px" : "6px 14px", cursor: "pointer", fontSize: lg ? 14 : 11, fontWeight: 800, fontFamily: "'Nunito',sans-serif", letterSpacing: 0.5 }}>
      {children}
    </button>
  );
}

function SmBtn({ onClick, children, danger }) {
  return (
    <button onClick={onClick} className="hov" style={{ background: danger ? C.ltred : C.parchment, border: `2px solid ${danger ? C.red : "#CCC0A8"}`, color: danger ? C.red : C.steel, borderRadius: 5, width: 26, height: 26, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
      {children}
    </button>
  );
}

function FField({ label, val, set, ph, multi }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: C.steel, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{label}</label>
      {multi
        ? <textarea value={val} onChange={e => set(e.target.value)} placeholder={ph} rows={3} style={{ ...IS, resize: "vertical", width: "100%" }} />
        : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...IS, width: "100%" }} />
      }
    </div>
  );
}

function SectionHead({ children, color }) {
  return (
    <div style={{ fontWeight: 900, fontSize: 20, color, marginBottom: 16, paddingBottom: 8, borderBottom: `3px solid ${color}`, letterSpacing: 0.5 }}>{children}</div>
  );
}

const IS = { background: C.chalk, border: "2px solid #CCC0A8", borderRadius: 6, padding: "8px 11px", color: C.ink, fontSize: 13, fontWeight: 600 };
