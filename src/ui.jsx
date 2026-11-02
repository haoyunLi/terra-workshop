import { X, PackageOpen } from 'lucide-react';
export function Icon({item,sheets,size=48}){
  if(!item)return <span className="sprite-wrap" style={{width:size,height:size}}/>;
  if(item.iconFile)return <span className="sprite-wrap" style={{width:size,height:size}}><img alt="" src={`./${item.iconFile}`} style={{maxWidth:size,maxHeight:size,imageRendering:'pixelated'}}/></span>;
  if(!item.sprite)return <span className="sprite-wrap no-sprite" title="内部占位物品，游戏未提供可用图标" style={{width:size,height:size}}><PackageOpen size={size*.5}/></span>;
  const [n,x,y,w,h]=item.sprite,s=sheets[n],scale=Math.min(size/w,size/h,2.5);
  return <span className="sprite-wrap" style={{width:size,height:size}}><span aria-hidden="true" style={{display:'block',width:w*scale,height:h*scale,backgroundImage:`url("./${s.file}")`,backgroundSize:`${s.w*scale}px ${s.h*scale}px`,backgroundPosition:`-${x*scale}px -${y*scale}px`,imageRendering:'pixelated',flexShrink:0}}/></span>;
}
export function Modal({title,children,onClose,wide=false}){return <div className="modal-shade" onClick={onClose}><section className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><header><h2>{title}</h2><button className="icon-btn" aria-label="关闭窗口" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;}
export function Field({label,children,hint}){return <label className="field"><span>{label}</span>{children}{hint?<small>{hint}</small>:null}</label>;}
export const rarityColors=['#c6d1df','#91b7ff','#88d792','#f2ae73','#f49299','#e69de8','#c9a1ff','#8ef0bd','#f3d98e','#86d5e5','#be96ff','#b8a2f7'];
