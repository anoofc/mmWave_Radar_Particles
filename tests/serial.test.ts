import { it,expect,vi } from 'vitest';
import { SerialTransport } from '../web/src/core/serial';
import { packet } from './fixtures';
it('reads fragmented USB data, writes commands and notifies on unplug',async()=>{
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const readable=new ReadableStream<Uint8Array>({start(c){controller=c;}});
  const writes:Uint8Array[]=[], close=vi.fn(async()=>{});
  const port={readable,writable:new WritableStream<Uint8Array>({write(v){writes.push(v);}}),open:vi.fn(async()=>{}),close};
  vi.stubGlobal('window',{isSecureContext:true});vi.stubGlobal('navigator',{serial:{requestPort:async()=>port}});
  const receive=vi.fn(),error=vi.fn(),lost=vi.fn(),boot=vi.fn();const transport=new SerialTransport(receive,error,lost,boot);
  await transport.connect();
  const line=JSON.stringify(packet())+'\n', encoder=new TextEncoder();controller.enqueue(encoder.encode('ESP-ROM:esp32c6-20220919\n'));controller.enqueue(encoder.encode(line.slice(0,30)));controller.enqueue(encoder.encode(line.slice(30)));
  await transport.send({type:'command',v:1,id:'test',command:'ping'});
  expect(new TextDecoder().decode(writes[0])).toContain('"command":"ping"');
  expect(boot).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();
  controller.error(new Error('unplugged'));await vi.waitFor(()=>expect(lost).toHaveBeenCalledOnce());
  expect(receive).toHaveBeenCalledWith(packet());expect(error).toHaveBeenCalledWith(expect.stringContaining('unplugged'));expect(close).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
