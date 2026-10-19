import { useRadar } from '../state/store';
import { displayPoint, MAX_RANGE_METRES } from '../core/coordinates';
const W = 620, H = 620, C = 310, R = 265;
export function RadarPlot() {
  const { filters, tracks, packet, simulate, mode } = useRadar();
  const scale = R / filters.range;
  const position = (p: {x:number;y:number}) => { const v = displayPoint(p,filters); return {x:C+v.x*scale,y:C-v.y*scale}; };
  return <svg className="radar-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Radar target plot in metres" onPointerDown={e => {
    if (mode !== 'simulation') return;
    const svg = e.currentTarget, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const matrix = svg.getScreenCTM(); if (!matrix) return;
    const p = pt.matrixTransform(matrix.inverse());
    simulate({automatic:false,x:Math.max(-filters.range,Math.min(filters.range,(p.x-C)/scale))*(filters.invertX?-1:1),y:Math.max(-filters.range,Math.min(filters.range,(C-p.y)/scale))*(filters.invertY?-1:1)});
  }}>
    <defs><radialGradient id="radarGlow"><stop stopColor="#103a3b" stopOpacity=".35"/><stop offset="1" stopColor="#0c161c" stopOpacity="0"/></radialGradient><clipPath id="plotClip"><rect x="45" y="45" width="530" height="530"/></clipPath></defs>
    <rect x="45" y="45" width="530" height="530" fill="url(#radarGlow)"/>
    <g clipPath="url(#plotClip)">
      {Array.from({length:13},(_,i)=>{const v=45+i*530/12;return <g key={i} className="grid"><path d={`M${v} 45V575 M45 ${v}H575`}/></g>;})}
      {[1,2,3,4].map(i=>{const radius=R*i/4;return <g key={i}><circle cx={C} cy={C} r={radius} className="range-ring"/><text x={C+radius/Math.sqrt(2)+5} y={C+radius/Math.sqrt(2)-5} className="range-label" style={{fill:'#8ca6b3',font:'9px var(--mono)',paintOrder:'stroke',stroke:'#0b141b',strokeWidth:3}}>{Number((filters.range*i/4).toFixed(2))} m</text></g>;})}
      <path d="M45 310H575 M310 45V575" className="axis"/>
      <path d={`M310 310 L${310-Math.sin(Math.PI/3)*Math.min(MAX_RANGE_METRES,filters.range)*scale} ${310-Math.cos(Math.PI/3)*Math.min(MAX_RANGE_METRES,filters.range)*scale} A${Math.min(MAX_RANGE_METRES,filters.range)*scale} ${Math.min(MAX_RANGE_METRES,filters.range)*scale} 0 0 1 ${310+Math.sin(Math.PI/3)*Math.min(MAX_RANGE_METRES,filters.range)*scale} ${310-Math.cos(Math.PI/3)*Math.min(MAX_RANGE_METRES,filters.range)*scale} Z`} className="zone"/>
      <circle cx={C} cy={C} r={1.5*scale} className="near-zone"/>
      {tracks.map(t=>{const p=position(t.position);return <g key={t.cluster}>
        <polyline points={t.trail.map(p=>{const v=position(p);return `${v.x},${v.y}`;}).join(' ')} className="trail"/>
        <circle cx={p.x} cy={p.y} r="15" className="target-halo"/><circle cx={p.x} cy={p.y} r="5" className="filtered-target"/>
        <text x={p.x+17} y={p.y-12} className="target-label">C{t.cluster.toString().padStart(2,'0')}</text>
        <text x={p.x+17} y={p.y+3} className="position-label">{t.position.x.toFixed(2)}, {t.position.y.toFixed(2)} m</text>
        <text x={p.x+17} y={p.y+15} className="position-label">r {Math.hypot(t.position.x,t.position.y).toFixed(2)} m</text>
      </g>;})}
      {packet?.targets.map((t,i)=>{const p=position(t);return <path key={i} d={`M${p.x-5} ${p.y}h10 M${p.x} ${p.y-5}v10`} className="raw-target"/>;})}
    </g>
    {[[-1,'−'],[0,''],[1,'']].map(([n])=>{const value=Number(n);return <g key={value}><text x={C+value*R} y="599" textAnchor="middle" className="axis-label">{(value*filters.range).toFixed(1)}</text><text x="32" y={C-value*R+4} textAnchor="end" className="axis-label">{(value*filters.range).toFixed(1)}</text></g>;})}
    <text x="574" y="617" className="axis-label" textAnchor="end">X / m</text><text x="17" y="27" className="axis-label">Y / m</text>
    <path d="M310 302l7 12h-14z" className="sensor-origin"/><text x="310" y="336" textAnchor="middle" className="origin-label">SENSOR · 0,0</text>
  </svg>;
}
