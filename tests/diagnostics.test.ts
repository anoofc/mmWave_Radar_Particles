import {it,expect} from 'vitest';
import {useRadar} from '../web/src/state/store';
it('keeps a bounded rejected line until source reset without overwriting it for unrelated errors',()=>{
  const s=useRadar.getState();s.resetData();s.fail('malformed JSON','x'.repeat(10000));
  expect(useRadar.getState().lastRejectedLine?.line).toHaveLength(8192);
  s.fail('Fullscreen permission denied');
  expect(useRadar.getState().lastRejectedLine?.message).toBe('malformed JSON');
  expect(useRadar.getState().parseErrors).toBe(2);
  s.resetData();expect(useRadar.getState().lastRejectedLine).toBeNull();
});
