import { it,expect } from 'vitest';
import { Simulator,defaultSimulation } from '../web/src/core/simulation';
import { validatePacket } from '../web/src/core/validation';
it('generates protocol-valid manual, absent, duplicate and intermittent reports',()=>{
  const simulator=new Simulator(),c={...defaultSimulation,automatic:false,x:-1,y:3};
  const p=simulator.packet(3000,c);expect(validatePacket(p)).toEqual(p);expect(p.targets[0]).toMatchObject({x:-1,y:3});
  expect(simulator.packet(3000,{...c,presence:false})).toMatchObject({presence:false,report:'valid',targets:[]});
  expect(simulator.packet(3000,{...c,duplicate:true}).targets).toHaveLength(2);
  expect(simulator.packet(1000,{...c,loss:true}).report).toBe('unavailable');
  expect(simulator.packet(3000,{...c,loss:true}).report).toBe('valid');
});
