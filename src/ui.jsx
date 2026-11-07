import { useState } from 'react';
import { X, PackageOpen } from 'lucide-react';
import { resolveIconAsset } from '../core/icon-assets.mjs';
export function Icon({item,sheets,size=48,label}){
  const [failedSource,setFailedSource]=useState('');
  const asset=resolveIconAsset(item,sheets,label),failed=asset.kind==='missing'||failedSource===asset.src;
  if(failed){const reason=asset.kind==='missing'?asset.reason:'图标资源未能加载';return <span className="sprite-wrap no-sprite" role="img" aria-label={`${asset.label}：${reason}`} title={`${asset.label} · ${reason}`} style={{width:size,height:size}}><PackageOpen size={Math.min(size*.5,28)} aria-hidden="true"/></span>;}
  const imageProps={src:asset.src,alt:'',draggable:false,decoding:'async',onError:()=>setFailedSource(asset.src)};
  if(asset.kind==='image')return <span className="sprite-wrap" role="img" aria-label={asset.label} title={asset.label} style={{width:size,height:size}}><img {...imageProps} style={{width:size,height:size,objectFit:'contain',imageRendering:'pixelated',display:'block'}}/></span>;
  const scale=Math.min(size/asset.width,size/asset.height,2.5);
  return <span className="sprite-wrap" role="img" aria-label={asset.label} title={asset.label} style={{width:size,height:size,flex:'0 0 auto'}}><span aria-hidden="true" style={{display:'block',position:'relative',overflow:'hidden',width:asset.width*scale,height:asset.height*scale,flex:'0 0 auto'}}><img {...imageProps} style={{position:'absolute',left:-asset.x*scale,top:-asset.y*scale,width:asset.sheetWidth*scale,height:asset.sheetHeight*scale,maxWidth:'none',imageRendering:'pixelated',display:'block'}}/></span></span>;
}
export function Modal({title,children,onClose,wide=false}){return <div className="modal-shade" onClick={onClose}><section className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><header><h2>{title}</h2><button className="icon-btn" aria-label="关闭窗口" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;}
export function Field({label,children,hint}){return <label className="field"><span>{label}</span>{children}{hint?<small>{hint}</small>:null}</label>;}
export const rarityColors=['#c6d1df','#91b7ff','#88d792','#f2ae73','#f49299','#e69de8','#c9a1ff','#8ef0bd','#f3d98e','#86d5e5','#be96ff','#b8a2f7'];
