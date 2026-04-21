import { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import TrainingApp from './components/TrainingApp.jsx';
import { T } from './theme.js';

function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try { await login(email, password); }
    catch (err) { setError(err.message); }
    setLoading(false);
  };

  const inputStyle = {
    width:"100%", padding:"10px 12px", fontSize:"0.9rem",
    fontFamily:T.font, background:T.surface, color:T.text,
    border:`1px solid ${T.border}`, borderRadius:0, outline:"none",
    boxSizing:"border-box", transition:"border-color 0.18s",
  };

  return (
    <div style={{fontFamily:T.font, minHeight:"100vh", display:"grid", gridTemplateColumns:"1fr 1fr", WebkitFontSmoothing:"antialiased"}}>

      {/* Levý panel — černý */}
      <div style={{background:"#1A1A1A", display:"flex", flexDirection:"column", justifyContent:"space-between", padding:48, position:"relative", overflow:"hidden"}}>
        <div style={{position:"absolute", bottom:-80, right:-80, width:320, height:320, border:"60px solid rgba(204,0,0,0.1)", borderRadius:"50%", pointerEvents:"none"}}/>
        <div style={{position:"absolute", top:-40, left:-40, width:200, height:200, border:"40px solid rgba(255,255,255,0.03)", borderRadius:"50%", pointerEvents:"none"}}/>

        {/* Logo */}
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <div style={{width:36, height:36, position:"relative", flexShrink:0}}>
            <div style={{position:"absolute", inset:0, background:"rgba(255,255,255,0.07)", border:"1.5px solid rgba(255,255,255,0.18)"}}/>
            <div style={{position:"absolute", left:0, right:0, bottom:0, height:"45%", background:"#CC0000"}}/>
          </div>
          <span style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:"0.875rem", fontWeight:500, color:"#fff", letterSpacing:"0.16em", textTransform:"uppercase"}}>PORTÁL</span>
        </div>

        {/* Obsah */}
        <div style={{flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"40px 0"}}>
          <h1 style={{fontSize:"2.25rem", fontWeight:600, color:"#fff", lineHeight:1.2, letterSpacing:"-0.02em", marginBottom:16}}>
            Advisor<br/><span style={{color:"#CC0000"}}>Training</span>
          </h1>
          <p style={{fontSize:"0.9375rem", color:"rgba(255,255,255,0.4)", fontWeight:300, lineHeight:1.6, maxWidth:300}}>
            Simulátor klientských schůzek pro trénink finančních poradců.
          </p>
          <div style={{marginTop:36, display:"flex", flexDirection:"column", gap:14}}>
            {["Realistické scénáře klientů","AI hodnocení a zpětná vazba","Sledování pokroku v čase"].map(f => (
              <div key={f} style={{display:"flex", alignItems:"center", gap:12, fontSize:"0.8125rem", color:"rgba(255,255,255,0.45)", fontWeight:300}}>
                <div style={{width:20, height:1, background:"#CC0000", flexShrink:0}}/>
                {f}
              </div>
            ))}
          </div>
        </div>

        <div style={{fontSize:"0.68rem", color:"rgba(255,255,255,0.18)", letterSpacing:"0.06em", fontFamily:"'IBM Plex Mono',monospace"}}>
          © 2025 PORTÁL SYSTÉM
        </div>
      </div>

      {/* Pravý panel — světlý */}
      <div style={{background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:48}}>
        <div style={{width:"100%", maxWidth:360}}>
          <h2 style={{fontSize:"1.5rem", fontWeight:600, color:T.text, letterSpacing:"-0.02em", marginBottom:8}}>Přihlášení</h2>
          <p style={{fontSize:"0.875rem", color:T.dim, fontWeight:300, marginBottom:32}}>Zadejte své přihlašovací údaje</p>

          <div style={{marginBottom:16}}>
            <label style={{fontSize:"0.75rem", color:T.dim, display:"block", marginBottom:6, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.08em"}}>E-mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="jana@firma.cz" style={inputStyle}
              onFocus={e=>e.target.style.borderColor="#CC0000"}
              onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>

          <div style={{marginBottom:24}}>
            <label style={{fontSize:"0.75rem", color:T.dim, display:"block", marginBottom:6, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.08em"}}>Heslo</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="••••••••" style={inputStyle}
              onKeyDown={e=>e.key==="Enter"&&handleSubmit(e)}
              onFocus={e=>e.target.style.borderColor="#CC0000"}
              onBlur={e=>e.target.style.borderColor=T.border}/>
          </div>

          {error && (
            <div style={{padding:"10px 14px", background:T.roseBg, border:`1px solid rgba(204,0,0,0.2)`, fontSize:"0.8125rem", color:T.accent, marginBottom:16}}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading||!email||!password}
            style={{width:"100%", padding:"12px 24px", fontFamily:T.font, fontSize:"0.875rem", fontWeight:600,
              background: loading||!email||!password ? "#8F8C87" : "#1A1A1A",
              color:"#fff", border:"none", cursor: loading||!email||!password ? "not-allowed" : "pointer",
              letterSpacing:"0.04em", transition:"background 0.18s"}}>
            {loading ? "Přihlašuji..." : "Přihlásit se →"}
          </button>

          <p style={{fontSize:"0.75rem", color:T.dim, marginTop:20, lineHeight:1.5}}>
            Nemáte účet? Požádejte svého manažera o vytvoření přístupu.
          </p>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.dim,display:"flex",alignItems:"center",justifyContent:"center"}}>Načítám...</div>;
  if (!user) return <LoginScreen />;
  return <TrainingApp />;
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
