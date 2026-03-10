import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

const W = 860;
const H = 300;

const BLUE   = "#3b82f6";
const INDIGO = "#6366f1";
const VIOLET = "#8b5cf6";
const GREEN  = "#10b981";
const GREEN2 = "#34d399";
const BG     = "#07091a";  // dark navy — matches site --deep

// ── Person ───────────────────────────────────────────────────────
function Person({ cx, cy, color, floatY, badge }) {
  return (
    <g transform={`translate(0,${floatY})`}>
      {/* box */}
      <rect x={cx - 56} y={cy - 60} width={112} height={112} rx={20}
        fill={color + "18"} stroke={color + "55"} strokeWidth={1.5}/>
      {/* head */}
      <circle cx={cx} cy={cy - 16} r={20}
        fill={color + "30"} stroke={color} strokeWidth={2.2}/>
      <circle cx={cx} cy={cy - 16} r={10}
        fill={color} opacity={0.4}/>
      {/* shoulders */}
      <path d={`M${cx-26} ${cy+38} C${cx-26},${cy+20} ${cx-14},${cy+12} ${cx},${cy+12} C${cx+14},${cy+12} ${cx+26},${cy+20} ${cx+26},${cy+38}`}
        fill={color + "20"} stroke={color} strokeWidth={2.2} strokeLinecap="round"/>
      {/* badge */}
      {badge && <>
        <circle cx={cx+30} cy={cy-42} r={13}
          fill={GREEN} opacity={0.9}/>
        <polyline points={`${cx+24},${cy-42} ${cx+29},${cy-37} ${cx+37},${cy-49}`}
          stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </>}
    </g>
  );
}

// ── Clock ────────────────────────────────────────────────────────
function Clock({ cx, cy, hAngle, mAngle }) {
  const R = 46;
  const tickPos = (deg) => {
    const r = (deg - 90) * Math.PI / 180;
    return { x: cx + Math.cos(r) * R * 0.84, y: cy + Math.sin(r) * R * 0.84 };
  };
  return (
    <>
      {/* box */}
      <rect x={cx - 82} y={cy - 82} width={164} height={164} rx={26}
        fill={BLUE + "18"} stroke={INDIGO + "70"} strokeWidth={1.5}/>
      {/* subtle rim glow */}
      <circle cx={cx} cy={cy} r={R + 8} fill={INDIGO} opacity={0.10}
        filter="url(#fGlow)"/>
      {/* orbit ring */}
      <circle cx={cx} cy={cy} r={R + 20} fill="none"
        stroke={INDIGO + "35"} strokeWidth={1} strokeDasharray="3 8"/>
      {/* clock face */}
      <circle cx={cx} cy={cy} r={R}
        fill="rgba(10,12,40,0.6)" stroke="#60a5fa" strokeWidth={1.8}/>
      {/* tick marks 12/3/6/9 */}
      {[0, 90, 180, 270].map(a => {
        const p = tickPos(a);
        return <circle key={a} cx={p.x} cy={p.y} r={3} fill="#93c5fd" opacity={0.7}/>;
      })}
      {/* hour hand */}
      <g transform={`rotate(${hAngle},${cx},${cy})`}>
        <line x1={cx} y1={cy + 6} x2={cx} y2={cy - R * 0.52}
          stroke="#93c5fd" strokeWidth={4} strokeLinecap="round"/>
      </g>
      {/* minute hand */}
      <g transform={`rotate(${mAngle},${cx},${cy})`}>
        <line x1={cx} y1={cy + 8} x2={cx} y2={cy - R * 0.78}
          stroke="#e2e8f0" strokeWidth={2.5} strokeLinecap="round"/>
      </g>
      {/* center dot */}
      <circle cx={cx} cy={cy} r={4} fill="#60a5fa"/>
      <circle cx={cx} cy={cy} r={2} fill="#ffffff"/>
    </>
  );
}

// ── Straight dashed arrow ─────────────────────────────────────────
function Arrow({ x1, y1, x2, y2, grad, offset, w = 2 }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy);
  const ux = dx/len, uy = dy/len;
  const nx = -uy, ny = ux;
  const HL = 9;
  const hx = x2 - ux*HL, hy = y2 - uy*HL;
  return <>
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={`url(#${grad})`} strokeWidth={w}
      strokeDasharray="5 4" strokeDashoffset={offset}
      strokeLinecap="round"/>
    <polyline
      points={`${hx+nx*5},${hy+ny*5} ${x2},${y2} ${hx-nx*5},${hy-ny*5}`}
      stroke={`url(#${grad})`} strokeWidth={w}
      strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </>;
}

// ── Curved arc arrow (quadratic bezier) ──────────────────────────
// cx, cy = control point
function ArcArrow({ x1, y1, x2, y2, cpx, cpy, grad, offset, w = 2.2 }) {
  // arrowhead: approximate tangent at endpoint
  const dx = x2 - cpx, dy = y2 - cpy;
  const len = Math.sqrt(dx*dx + dy*dy);
  const ux = dx/len, uy = dy/len;
  const nx = -uy, ny = ux;
  const HL = 10;
  const hx = x2 - ux*HL, hy = y2 - uy*HL;
  const d = `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;
  return <>
    <path d={d} fill="none"
      stroke={`url(#${grad})`} strokeWidth={w}
      strokeDasharray="6 5" strokeDashoffset={offset}
      strokeLinecap="round"/>
    <polyline
      points={`${hx+nx*5},${hy+ny*5} ${x2},${y2} ${hx-nx*5},${hy-ny*5}`}
      stroke={`url(#${grad})`} strokeWidth={w}
      strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </>;
}

// ── Token along quadratic bezier ─────────────────────────────────
function ArcToken({ p, x1, y1, x2, y2, cpx, cpy, r, color }) {
  if (p <= 0 || p >= 1) return null;
  // de Casteljau for quadratic bezier
  const q0x = x1 + (cpx - x1) * p;
  const q0y = y1 + (cpy - y1) * p;
  const q1x = cpx + (x2 - cpx) * p;
  const q1y = cpy + (y2 - cpy) * p;
  const bx = q0x + (q1x - q0x) * p;
  const by = q0y + (q1y - q0y) * p;
  const a = p < 0.10 ? p/0.10 : p > 0.85 ? (1-p)/0.15 : 1;
  return <>
    <circle cx={bx} cy={by} r={r+5} fill={color} opacity={0.18*a} filter="url(#fGlow)"/>
    <circle cx={bx} cy={by} r={r}   fill={color} opacity={0.92*a}/>
  </>;
}

// ── Text helper ───────────────────────────────────────────────────
const T = ({ x, y, size, weight, fill, ls = 0, children }) => (
  <text x={x} y={y} textAnchor="middle"
    fontFamily="Inter, system-ui, sans-serif"
    fontSize={size} fontWeight={weight} fill={fill} letterSpacing={ls}>
    {children}
  </text>
);

// ═══════════════════════════════════════════════════════════════
export function HeroAnimation() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const floatL =  Math.sin(t * Math.PI / 3) * 6;
  const floatR =  Math.sin((t + 3) * Math.PI / 3) * 6;
  const hAngle =  (t / 6) * 360;
  const mAngle =  (t / 1.5) * 360;
  const dashOff = -(t * 16) % 18;

  // Tokens loop along the arc from You → Heir
  const LOOP = 2.4;
  const toks = [0, 0.60, 1.20, 1.80].map(d => {
    const v = ((t - d) % LOOP) / LOOP;
    return v < 0 ? v + 1 : v;
  });

  const CX = 430, CY = 110;  // clock center, higher up
  const LX = 148, RX = 712;
  const gap = 12;

  // Left arrow: You → WillChain (activity signal, horizontal)
  const L1 = LX + 56 + gap;
  const L2 = CX - 82 - gap;
  const signalY = CY - 20; // slightly above center for the signal line

  // Arc: You → Heir DIRECTLY, curving below WillChain
  const arcX1 = LX + 56;         // right edge of You box
  const arcY1 = CY + 20;         // lower half of You
  const arcX2 = RX - 56;         // left edge of Heir box
  const arcY2 = CY + 20;         // lower half of Heir
  const arcCPX = CX;             // control point X = WillChain center
  const arcCPY = CY + 130;       // control point below WillChain

  // Trigger line: WillChain → arc midpoint (downward signal)
  const triggerX = CX;
  const triggerY1 = CY + 82 + gap; // below WillChain box
  const triggerY2 = arcCPY - 18;   // stop just above the arc path midpoint

  return (
    <AbsoluteFill style={{ background: BG }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          {/* filters */}
          <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" result="b"/>
            <feComposite in="SourceGraphic" in2="b" operator="over"/>
          </filter>
          <filter id="fAmb" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="28"/>
          </filter>

          {/* gradient: You → WillChain signal */}
          <linearGradient id="gAL" gradientUnits="userSpaceOnUse"
            x1={L1} y1={signalY} x2={L2} y2={signalY}>
            <stop stopColor={BLUE}/><stop offset="1" stopColor={VIOLET}/>
          </linearGradient>

          {/* gradient: direct transfer arc You → Heir */}
          <linearGradient id="gArc" gradientUnits="userSpaceOnUse"
            x1={arcX1} y1={arcY1} x2={arcX2} y2={arcY2}>
            <stop stopColor={BLUE}/><stop offset="1" stopColor={GREEN}/>
          </linearGradient>

          {/* gradient: trigger signal from WillChain downward */}
          <linearGradient id="gTrig" gradientUnits="userSpaceOnUse"
            x1={triggerX} y1={triggerY1} x2={triggerX} y2={triggerY2}>
            <stop stopColor={VIOLET}/><stop offset="1" stopColor={GREEN}/>
          </linearGradient>
        </defs>

        {/* ── ambient glows ── */}
        <circle cx={LX} cy={CY} r={70} fill={BLUE}   opacity={0.30} filter="url(#fAmb)"/>
        <circle cx={RX} cy={CY} r={70} fill={GREEN}  opacity={0.25} filter="url(#fAmb)"/>
        <circle cx={CX} cy={CY} r={80} fill={INDIGO} opacity={0.22} filter="url(#fAmb)"/>
        {/* glow along arc midpoint */}
        <circle cx={CX} cy={arcCPY - 30} r={50} fill={GREEN} opacity={0.12} filter="url(#fAmb)"/>

        {/* ── panel ── */}
        <rect x={8} y={8} width={W-16} height={H-16} rx={22}
          fill="#ffffff07" stroke="#ffffff10" strokeWidth={1}/>

        {/* ── LEFT: You ── */}
        <Person cx={LX} cy={CY} color={BLUE} floatY={floatL}/>
        <T x={LX} y={CY + 70} size={13} weight={700} fill="#f1f5f9">You</T>
        <T x={LX} y={CY + 84} size={10} weight={400} fill="#94a3b8">wallet owner</T>

        {/* ── SIGNAL ARROW: You → WillChain ── */}
        <Arrow x1={L1} y1={signalY} x2={L2} y2={signalY} grad="gAL" offset={dashOff}/>
        <T x={(L1+L2)/2} y={signalY - 14} size={9} weight={700} fill="#60a5fa" ls={0.5}>ANY OUTGOING TX</T>
        <T x={(L1+L2)/2} y={signalY + 18} size={9} weight={600} fill="#64748b" ls={0.5}>RESETS TIMER</T>

        {/* ── CENTER: WillChain ── */}
        <Clock cx={CX} cy={CY} hAngle={hAngle} mAngle={mAngle}/>
        <T x={CX} y={CY + 70} size={13} weight={700} fill="#f1f5f9">WillChain</T>
        <T x={CX} y={CY + 84} size={10} weight={400} fill="#94a3b8">watches activity</T>

        {/* ── TRIGGER: WillChain → arc (downward dashed line) ── */}
        <line x1={triggerX} y1={triggerY1} x2={triggerX} y2={triggerY2}
          stroke={`url(#gTrig)`} strokeWidth={1.8}
          strokeDasharray="4 4" strokeDashoffset={dashOff}
          strokeLinecap="round"/>
        {/* arrowhead pointing down */}
        <polyline
          points={`${triggerX-6},${triggerY2-8} ${triggerX},${triggerY2} ${triggerX+6},${triggerY2-8}`}
          stroke={VIOLET} strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <T x={CX + 38} y={triggerY2 - 4} size={8} weight={600} fill={VIOLET} ls={0.4}>TRIGGERS</T>

        {/* ── ARC: You → Heir DIRECTLY (tokens flow along this) ── */}
        <ArcArrow
          x1={arcX1} y1={arcY1}
          x2={arcX2} y2={arcY2}
          cpx={arcCPX} cpy={arcCPY}
          grad="gArc" offset={dashOff} w={2.4}/>

        {/* arc label */}
        <T x={CX} y={arcCPY - 2} size={9} weight={400} fill="#64748b" ls={0.5}>IF INACTIVE —</T>
        <T x={CX} y={arcCPY + 14} size={9} weight={700} fill={GREEN} ls={0.5}>DIRECT TRANSFER</T>

        {/* ── TOKEN DOTS flowing along the arc ── */}
        {toks.map((p, i) => (
          <ArcToken key={i} p={p}
            x1={arcX1} y1={arcY1}
            x2={arcX2} y2={arcY2}
            cpx={arcCPX} cpy={arcCPY}
            r={[6,5,4,3][i]}
            color={[GREEN, GREEN2, GREEN2, "#6ee7b7"][i]}/>
        ))}

        {/* ── RIGHT: Heir ── */}
        <Person cx={RX} cy={CY} color={GREEN} floatY={floatR} badge/>
        <T x={RX} y={CY + 70} size={13} weight={700} fill="#f1f5f9">Heir</T>
        <T x={RX} y={CY + 84} size={10} weight={400} fill="#94a3b8">receives funds</T>

      </svg>
    </AbsoluteFill>
  );
}
