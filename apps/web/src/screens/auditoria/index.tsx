import { useEffect, useState } from 'react';
import type { AuditoriaList } from '@stodia/shared';
import { btn, card, pill, pillBase, td, th } from '../../components/system/styles';
import { useToast } from '../../components/system/UiProvider';
import { api } from '../../lib/api';
import { runPrint, usePrintBusy } from '../../components/finanzas/print';
import { docAudit } from '../../components/academico/printDocs';

const ACT_TONE = { Insert: 'ok', Update: 'info', Delete: 'bad' } as const;
const COLS = ['Timestamp (UTC)', 'Usuario', 'Acción', 'Tabla', 'Registro', 'Valor anterior', 'Valor nuevo', 'IP'];
const sel = 'h-[34px] rounded-md border border-slate-300 bg-white px-2 text-[13px] text-ink';

export default function Screen() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [user, setUser] = useState('');
  const [act, setAct] = useState('');
  const [day, setDay] = useState('');
  const [data, setData] = useState<AuditoriaList | null>(null);
  const [users, setUsers] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q, user, act, day }).toString();
      api.get<AuditoriaList>('/auditoria?' + qs).then(d => { setData(d); if (!user) setUsers(d.users); }).catch(e => toast((e as Error).message, 'bad'));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, user, act, day, toast]);

  const pbA = usePrintBusy()('audit', 'Imprimir / exportar', 'ph ph-printer');

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.01em]">Auditoría Global</h1>
          <p className="mt-1 text-[13px] text-slate-600">Registro append-only: no se puede editar ni eliminar. Hora en UTC.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ok-fg"><i className="ph-fill ph-lock-key" />Inmutable</span>
          <button onClick={() => data && runPrint('audit', docAudit(data.rows))} className={btn}><i className={pbA.icon} style={{ animation: pbA.spin }} />{pbA.label}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-[340px] flex-1">
          <i className="ph ph-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Registro, tabla o valor…" className="h-[34px] w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-[13px] text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft" />
        </div>
        <select value={user} onChange={e => setUser(e.target.value)} className={sel}>
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={act} onChange={e => setAct(e.target.value)} className={sel}>
          <option value="">Toda acción</option><option>Insert</option><option>Update</option><option>Delete</option>
        </select>
        <select value={day} onChange={e => setDay(e.target.value)} className={sel}>
          <option value="">Todo el historial</option><option value="today">Hoy</option><option value="prev">Días anteriores</option>
        </select>
        <span className="ml-auto text-xs text-slate-500">{data ? `${data.count} de ${data.total} eventos` : ''}</span>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full min-w-[1000px] border-collapse text-xs">
            <thead><tr>{COLS.map(c => <th key={c} className={`${th} sticky top-0`}>{c}</th>)}</tr></thead>
            <tbody>
              {data?.rows.map(l => (
                <tr key={l.id} className="h-[42px] hover:bg-slate-50">
                  <td className={`${td} whitespace-nowrap font-mono text-[11px] text-slate-600`}>{l.t}</td>
                  <td className={`${td} font-mono text-[11px]`}>{l.usr}</td>
                  <td className={td}><span className={`${pillBase} w-[62px] ${pill[ACT_TONE[l.a]]}`}>{l.a}</span></td>
                  <td className={`${td} font-medium`}>{l.tabla}</td>
                  <td className={`${td} font-mono text-[11px] text-slate-600`}>{l.registro}</td>
                  <td className={`${td} max-w-[200px] truncate font-mono text-[11px] text-bad-fg`} title={l.prev}>{l.prev}</td>
                  <td className={`${td} max-w-[200px] truncate font-mono text-[11px] text-ok-fg`} title={l.next}>{l.next}</td>
                  <td className={`${td} font-mono text-[11px] text-slate-500`}>{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.rows.length && <div className="px-5 py-8 text-[13px] text-slate-500">Ningún registro coincide con los filtros.</div>}
        </div>
      </section>
    </div>
  );
}
