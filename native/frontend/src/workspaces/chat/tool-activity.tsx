import { Check, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ChatMessage } from "./data";
const names:Record<string,string>={read_file:"读取文件",write_file:"修改文件",read:"读取技能资料",memory_search:"查询记忆",memory_save:"记录记忆建议",planner_read:"读取计划",planner_propose:"准备计划草案",planner_commit:"采用已确认计划"};
export function ToolActivities({items}:{items:NonNullable<ChatMessage["tools"]>}) {
 return <div className="chat-tool-activities">{items.map(item=>{
  let target="";try{const args=JSON.parse(item.arguments);target=args.path||args.command||args.query||""}catch{/* Keep invalid historical arguments available in details. */}
  const done=item.state==="succeeded",failed=["failed","cancelled","denied","outcome_unknown"].includes(item.state);
  return <details key={item.id} className="chat-tool-activity" data-state={item.state}><summary>{done?<Check size={14}/>:failed?<TriangleAlert size={14}/>:<LoaderCircle size={14}/>}<span>{names[item.name]||item.name.replace(/^mcp__/,"").replaceAll("__"," / ")}{target&&` · ${target}`}</span><small>{item.state==="awaiting_approval"?"等待批准":failed?item.state==="outcome_unknown"?"结果待确认":"未完成":done?item.milliseconds?`${(item.milliseconds/1000).toFixed(1)}s`:"已完成":"进行中"}</small><ChevronRight size={12}/></summary><pre>{item.arguments}</pre>{item.result&&<pre>{item.result}{item.result.length>=4096?"\n…仅预览前 4096 字符":""}</pre>}</details>
 })}</div>;
}
