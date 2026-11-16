import { useState } from "react";
import type { WorkTask } from "../data/work";
import { Input } from "./text-field";
import { Select } from "./select";
import { ScheduleBlockFields } from "./schedule-block-fields";

export function TaskScheduleFields({ task, onChange, className }: { task: WorkTask; onChange: (task: WorkTask) => void; className: string }) {
  const [precise, setPrecise] = useState(Boolean(task.dueAt || task.dueLocal));
  const update = (fields: Partial<WorkTask>) => onChange({ ...task, ...fields });
  return <>
    <div className={className}>
      <label>排期开始<Input type="date" value={task.date} onChange={e => update({ date: e.target.value, endDate: e.target.value ? task.endDate : "" })} /></label>
      <label>排期结束<Input type="date" value={task.endDate} disabled={!task.date} min={task.date || undefined} onChange={e => update({ endDate: e.target.value })} /></label>
    </div>
    <div className={className}>
      <label>截止方式<Select value={precise ? "time" : "date"} onChange={e => { setPrecise(e.target.value === "time"); update({ dueAt: "", dueDate: "", dueLocal: "" }); }}><option value="date">按日期</option><option value="time">精确时间</option></Select></label>
      <label>截止{precise ? "时间" : "日期"}（可选）{precise
        ? <Input type="datetime-local" value={task.dueLocal || ""} onChange={e => update({ dueLocal: e.target.value, dueAt: "", dueDate: "" })} />
        : <Input type="date" value={task.dueDate || ""} onChange={e => update({ dueDate: e.target.value, dueAt: "", dueLocal: "" })} />}</label>
    </div>
    <label>时区<Input value={task.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={e => update({ timezone: e.target.value,blocks:task.blocks?.map(b=>b.binding==="floating_local"&&!b.locked?{...b,timezone:e.target.value}:b) })} placeholder="Asia/Taipei" required /></label>
    <ScheduleBlockFields blocks={task.blocks||[]} timezone={task.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={blocks=>update({blocks})}/>
  </>;
}
