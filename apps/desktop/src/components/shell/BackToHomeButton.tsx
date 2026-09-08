import { House } from 'lucide-react';

export function BackToHomeButton({onHome,compact=false}:{onHome?:()=>void;compact?:boolean}){
  if(!onHome)return null;
  return <button type="button" className={compact?'dg-icon-button':'btn-secondary'} onClick={onHome} aria-label="Back to Home" title="Back to Home" style={compact?undefined:{display:'inline-flex',alignItems:'center',gap:6}}><House size={16}/>{!compact&&<span>Home</span>}</button>;
}
