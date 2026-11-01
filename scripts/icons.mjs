import {writeFile, mkdir} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const crcTable = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([size,t,data,checksum]);}
function segment(x,y,x1,y1,x2,y2,width){const dx=x2-x1,dy=y2-y1;const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-x1-t*dx,y-y1-t*dy)<=width/2;}
function color(x,y){
  let c=[20,24,28];
  if(x>=107&&x<=308&&y>=145&&y<=376)c=[255,155,69];
  if(segment(x,y,146,185,269,185,15)||segment(x,y,146,223,224,223,15)||segment(x,y,123,331,307,331,15))c=[68,44,27];
  const radius=Math.hypot(x-332,y-327);if(radius<=95)c=[20,24,28];if(radius<=79)c=[57,169,255];
  if(segment(x,y,332,274,332,329,16)||segment(x,y,332,329,367,353,16))c=[18,40,58];
  return c;
}
export async function generateIcons(directory){
  await mkdir(directory,{recursive:true});
  for(const size of [180,192,512]){
    const rows=Buffer.alloc(size*(size*4+1));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const rgb=[0,0,0];for(const dy of [.25,.75])for(const dx of [.25,.75]){const c=color((x+dx)*512/size,(y+dy)*512/size);for(let i=0;i<3;i++)rgb[i]+=c[i]/4;}
      const index=y*(size*4+1)+1+x*4;for(let i=0;i<3;i++)rows[index+i]=Math.round(rgb[i]);rows[index+3]=255;
    }
    const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
    await writeFile(`${directory}/${size===180?'apple-touch-icon':`icon-${size}`}.png`,png);
  }
}
