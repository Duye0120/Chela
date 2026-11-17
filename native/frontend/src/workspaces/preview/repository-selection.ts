import { useSyncExternalStore } from "react";
const event="chela-git-scope";
export const readRepository=(session:string)=>localStorage.getItem(`chela.git.selection.${session}`)||"all";
export function selectRepository(session:string,path:string){localStorage.setItem(`chela.git.selection.${session}`,path);window.dispatchEvent(new Event(event))}
function subscribe(listener:()=>void){window.addEventListener(event,listener);window.addEventListener("storage",listener);return()=>{window.removeEventListener(event,listener);window.removeEventListener("storage",listener)}}
export function useRepository(session:string){const value=useSyncExternalStore(subscribe,()=>readRepository(session));return [value,(path:string)=>selectRepository(session,path)] as const}
