import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, UserRound } from 'lucide-react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { ApiState, ErrorBox } from '../components/ApiState.jsx';
import { useI18n } from '../lib/i18n.jsx';

/** Minimal shift sign-in (prototype: no password). Loads the operator's machine and hands over to the app. */
export default function Login({ onLogin }) {
  const { t } = useI18n();
  const meta = useApi(() => api.meta(), []);
  const ops = useApi(() => api.operators(), []);
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = sel ?? meta.data?.demo_operator ?? 'OP1007';

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const op = await api.operator(id);
      onLogin({ operatorId: op.operator_id, machineId: op.primary_machine_id, operator: op });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="app-ground min-h-full flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel w-full max-w-[460px] p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-bg3 flex items-center justify-center"><UserRound className="text-assist" /></div>
          <div>
            <div className="label text-assist">Smart Operator Assistant</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">{t('login.title')}</h1>
          </div>
        </div>
        <p className="text-ink2 mt-3">{t('login.sub')}</p>
        <div className="mt-5">
          <ApiState loading={ops.loading} error={ops.error} data={ops.data} onRetry={ops.reload} rows={1}>
            {(list) => (
              <label className="block">
                <span className="label">Operator ID</span>
                <select value={id} onChange={(e) => setSel(e.target.value)} aria-label="Operator ID"
                  className="mt-2 w-full h-12 rounded-md bg-bg3 border border-ctl px-3 num text-lg">
                  {list.map((o) => <option key={o.operator_id} value={o.operator_id}>{o.operator_id} · {o.experience_level} · {o.operating_shift}</option>)}
                </select>
              </label>
            )}
          </ApiState>
        </div>
        {err && <div className="mt-4"><ErrorBox error={err} compact /></div>}
        <button className="btn btn-primary w-full mt-5" onClick={go} disabled={busy || !ops.data}><LogIn size={18} />{t('login.go')}</button>
        <p className="text-xs text-ink3 mt-4">{meta.data?.disclaimer ?? 'Prototype on synthetic data.'}</p>
      </motion.div>
    </div>
  );
}
