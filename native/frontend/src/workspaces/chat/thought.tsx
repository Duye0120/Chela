import { ChevronRight, Sparkles } from "lucide-react";
export function Thought({text,running=false}:{text:string;running?:boolean}) {
 return <details className="chat-thought"><summary><Sparkles size={14}/>{running?"正在思考":"已思考"}<ChevronRight size={12}/></summary><div>{text}</div></details>;
}
