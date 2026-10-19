import { useRadar } from '../state/store';
export function HealthDiagnostics() {
  const {parseErrors,bootLines,packet,status,lastRejectedLine} = useRadar();
  const exportRejected = () => {
    if (!lastRejectedLine) return;
    const text = JSON.stringify({format:'mr60-serial-diagnostic',bridgeFirmware:status?.firmware??null,...lastRejectedLine},null,2);
    const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='mr60-rejected-packet.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <>
    <dl className="device-details" style={{marginTop:16}}>
      <div><dt>Host / protocol errors</dt><dd>{parseErrors}</dd></div>
      <div><dt>Device rejected frames / commands</dt><dd>{packet?.errors??status?.errors??0}</dd></div>
      <div><dt>USB output drops</dt><dd>{status?.tx_dropped??0}</dd></div>
      <div><dt>ESP startup lines</dt><dd>{bootLines}</dd></div>
    </dl>
    {packet?.presence===null&&packet.report==='valid'&&<p className="hint">Targets are available, but no recent presence report was accepted. Bridge firmware 1.0.1 supports one- and two-byte presence reports.</p>}
    {status&&['1.0.0','1.0.1'].includes(status.firmware)&&<p className="hint text-warning">Bridge update available: upload firmware 1.0.2 for improved USB packet framing, then reconnect.</p>}
    {lastRejectedLine&&<details className="serial-diagnostic"><summary>Last rejected serial packet</summary><p className="hint">{lastRejectedLine.message}</p><pre className="json-view">{JSON.stringify(lastRejectedLine.line)}</pre><button onClick={exportRejected}>Download rejected packet</button><p className="hint">Includes the received line and bridge version. Malformed packets are rejected; the next complete valid line is processed normally.</p></details>}
  </>;
}
