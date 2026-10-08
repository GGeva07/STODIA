import { useState } from 'react';
import { btnPrimary, card, input } from '../../components/system/styles';
import { useToast } from '../../components/system/UiProvider';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const label = 'flex flex-col gap-1 text-xs font-medium text-slate-600';

/** Clave de supervisor de la instancia: solo Super Admin, confirmando con su contraseña actual. El servidor guarda solo el hash. */
export default function SupervisorPin() {
  const { user } = useSession();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  if (user?.rol !== 'Super Admin') return null;
  const ready = password.length > 0 && pin.length >= 4 && pin === pin2 && !busy;
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/auth/supervisor', { password, pin });
      setPassword(''); setPin(''); setPin2('');
      toast('Clave de supervisor actualizada · registrado en auditoría', 'ok');
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <section className={`${card} flex max-w-[860px] flex-col gap-3 p-[18px]`}>
      <div>
        <div className="text-sm font-semibold">Clave de supervisor</div>
        <div className="mt-0.5 text-xs text-slate-500">Autoriza anulaciones, eliminaciones y exoneraciones a roles sin permiso directo. Se guarda cifrada en el servidor (mínimo 4 caracteres).</div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        <label className={label}>Tu contraseña actual<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={input} /></label>
        <label className={label}>Nueva clave<input type="password" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)} className={`${input} font-mono`} /></label>
        <label className={label}>Repetir clave<input type="password" autoComplete="new-password" value={pin2} onChange={e => setPin2(e.target.value)} className={`${input} font-mono`} /></label>
      </div>
      {pin2 && pin !== pin2 && <div className="text-xs font-medium text-[#DC2626]">Las claves no coinciden.</div>}
      <div className="flex justify-end"><button onClick={save} disabled={!ready} className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`}><i className="ph ph-key" />Cambiar clave</button></div>
    </section>
  );
}
