import { describe,it,expect } from 'vitest';
import { parsePacket,LineParser } from '../web/src/core/protocol';
import { packet } from './fixtures';
describe('USB protocol',()=>{
  it('accepts valid JSON with original coordinates',()=>expect(parsePacket(JSON.stringify(packet()))).toEqual(packet()));
  it('rejects malformed JSON',()=>expect(()=>parsePacket('{broken')).toThrow());
  it('rejects future versions',()=>expect(()=>parsePacket(JSON.stringify({...packet(),v:2}))).toThrow(/version/));
  it('rejects missing target fields',()=>expect(()=>parsePacket(JSON.stringify({...packet(),targets:[{x:0,y:1}]}))).toThrow(/target/));
  it('preserves a valid empty target array',()=>expect(parsePacket(JSON.stringify(packet({targets:[]})))).toMatchObject({report:'valid',targets:[]}));
  it('distinguishes unavailable and absent',()=>{
    expect(parsePacket(JSON.stringify(packet({presence:false,targets:[]})))).toHaveProperty('presence',false);
    expect(parsePacket(JSON.stringify(packet({presence:null,presence_at:null,report:'unavailable',target_at:null,targets:[]})))).toHaveProperty('report','unavailable');
  });
  it.each([NaN,Infinity,101,'1',null])('rejects invalid coordinate %s',x=>expect(()=>parsePacket(JSON.stringify({...packet(),targets:[{...packet().targets[0],x}]}))).toThrow());
  it('rejects unsupported units, missing counters and absent validity times',()=>{
    for(const p of [{...packet(),units:'cm'},{...packet(),sensor_frames:undefined},{...packet(),target_at:null}])expect(()=>parsePacket(JSON.stringify(p))).toThrow();
  });
  it('joins partial lines and splits multiple reads, CRLF and blanks',()=>{
    const out:unknown[]=[],errors:string[]=[],p=new LineParser(v=>out.push(v),s=>errors.push(s));
    const line=JSON.stringify(packet());p.push(line.slice(0,30));expect(out).toHaveLength(0);
    p.push(line.slice(30)+'\r\n\n'+line+'\n');expect(out).toEqual([packet(),packet()]);expect(errors).toEqual([]);
  });
  it('recovers after malformed and oversized lines without parsing suffixes',()=>{
    const out:unknown[]=[],errors:string[]=[],p=new LineParser(v=>out.push(v),s=>errors.push(s),1000);
    p.push('x'.repeat(1001));p.push(JSON.stringify(packet())+'\n{bad}\n'+JSON.stringify(packet())+'\n');
    expect(errors).toHaveLength(2);expect(out).toHaveLength(1);
  });
  it('clears partial input on disconnect',()=>{
    const out:unknown[]=[],p=new LineParser(v=>out.push(v),()=>{});p.push('{"v":');p.reset();p.push(JSON.stringify(packet())+'\n');expect(out).toHaveLength(1);
  });
  it('classifies a fragmented ESP32-C6 startup log without hiding malformed packets',()=>{
    const out:unknown[]=[],errors:string[]=[],boot:string[]=[];
    const p=new LineParser(v=>out.push(v),s=>errors.push(s),8192,s=>boot.push(s));
    p.push('ESP-ROM:esp32');p.push('c6-20220919\r\nBuild:Sep 19 2022\r\n');
    p.push('rst:0x1 (POWERON),boot:0xc (SPI_FAST_FLASH_BOOT)\nSaved PC:0x40800000\nSPIWP:0xee\nmode:DIO, clock div:2\nload:0x4086c410,len:0xd00\nentry 0x4086c410\n');
    p.push(JSON.stringify(packet())+'\n{broken}\nUnexpected application log\n');
    expect(boot).toHaveLength(8);expect(errors).toHaveLength(2);expect(out).toEqual([packet()]);
  });
  it('still rejects protocol errors after a boot banner',()=>{
    const errors:string[]=[],out:unknown[]=[];
    const p=new LineParser(v=>out.push(v),e=>errors.push(e));
    p.push('ESP-ROM:esp32c6-20220919\n'+JSON.stringify({...packet(),v:2})+'\n'+JSON.stringify({...packet(),targets:[{x:0}]})+'\n');
    expect(errors).toHaveLength(2);expect(out).toHaveLength(0);
  });
  it('preserves a failure near character 521 and recovers at the next delimiter',()=>{
    const malformed='{"padding":"'+'x'.repeat(507)+'" true}';
    const rejected:{message:string;line?:string}[]=[],out:unknown[]=[];
    const p=new LineParser(v=>out.push(v),(message,line)=>rejected.push({message,line}));
    const input=malformed+'\n\n'+JSON.stringify(packet())+'\n';
    for(let offset=0;offset<input.length;offset+=64)p.push(input.slice(offset,offset+64));
    expect(rejected).toHaveLength(1);expect(rejected[0].line).toBe(malformed);
    expect(out).toEqual([packet()]);
  });
  it('assembles valid long packets across USB packet and ring-buffer boundaries',()=>{
    const original={...packet(),padding:'x'.repeat(1100)};
    const out:unknown[]=[],errors:string[]=[],p=new LineParser(v=>out.push(v),e=>errors.push(e));
    const input='\n'+JSON.stringify(original)+'\n';
    for(let offset=0;offset<input.length;offset+=64)p.push(input.slice(offset,offset+64));
    expect(out).toEqual([original]);expect(errors).toEqual([]);
  });
});
