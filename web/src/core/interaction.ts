import { useRadar } from '../state/store';
import type { InteractionState } from './tracking';
/** Stable Phase 2 boundary. Positions and velocity use metres and metres/second.
 * Screen coordinates reflect view inversion, and clamp to [0,1]. */
export const interactionAPI = {
  getSnapshot: (): InteractionState => useRadar.getState().interaction,
  subscribe(listener: (state: InteractionState) => void) {
    return useRadar.subscribe((state, previous) => { if (state.interaction !== previous.interaction) listener(state.interaction); });
  }
};
