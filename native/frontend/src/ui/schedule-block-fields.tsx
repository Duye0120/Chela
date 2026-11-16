import type { ScheduleBlock } from "../data/work";
import { Button } from "./button";
import { Input } from "./text-field";
import { Select } from "./select";

export function ScheduleBlockFields({blocks,onChange,timezone,plan=false}:{blocks:ScheduleBlock[];onChange:(blocks:ScheduleBlock[])=>void;timezone:string;plan?:boolean}){
  function update(index:number,patch:Partial<ScheduleBlock>){onChange(blocks.map((b,i)=>i===index?{...b,...patch}:b))}
  return <fieldset className="schedule-blocks"><legend>时间块</legend>
    {blocks.map((block,index)=><fieldset key={block.id||index}><legend>第 {index+1} 段{block.estimateSource==="model"?" · 估计时长":""}</legend>
      <div className="schedule-block-row">
        <label>开始<Input required type={block.binding==="absolute_instant"?"text":block.allDay?"date":"datetime-local"} disabled={block.locked} value={block.binding==="absolute_instant"?block.startAt:block.localStart} onChange={e=>update(index,block.binding==="absolute_instant"?{startAt:e.target.value}:{localStart:e.target.value})}/></label>
        <label>结束{block.allDay?"（不含当天）":""}<Input required type={block.binding==="absolute_instant"?"text":block.allDay?"date":"datetime-local"} disabled={block.locked} value={block.binding==="absolute_instant"?block.endAt:block.localEnd} onChange={e=>update(index,block.binding==="absolute_instant"?{endAt:e.target.value}:{localEnd:e.target.value})}/></label>
        <label>时区<Input required disabled={block.locked} value={block.timezone} onChange={e=>update(index,{timezone:e.target.value})}/></label>
        <label>时间规则<Select disabled={block.locked} value={block.binding} onChange={e=>update(index,{binding:e.target.value as ScheduleBlock["binding"],allDay:e.target.value==="absolute_instant"?false:block.allDay})}><option value="floating_local">跟随事项时区</option><option value="zoned_local">固定所选时区</option><option value="absolute_instant">固定绝对时刻</option></Select></label>
      </div>
      {block.binding==="absolute_instant"?<small>使用带偏移的 ISO 时间，例如 2026-12-01T09:00:00+08:00；更换时区不改变时刻。</small>:<label><input type="checkbox" checked={block.allDay} disabled={block.locked} onChange={e=>update(index,{allDay:e.target.checked,localStart:"",localEnd:""})}/>全天</label>}
      <label><input type="checkbox" checked={block.locked} disabled={plan&&block.locked} onChange={e=>update(index,{locked:e.target.checked})}/>锁定时间</label>
      <Button disabled={block.locked} onClick={()=>onChange(blocks.filter((_,i)=>i!==index))}>删除这段排期</Button>
    </fieldset>)}
    <Button onClick={()=>onChange([...blocks,{id:"",revision:0,startAt:"",endAt:"",localStart:"",localEnd:"",timezone,binding:"floating_local",allDay:false,locked:false,estimateSource:"user"}])}>添加时间块</Button>
    <small>调整排期不会改变截止时间或完成状态。锁定后需先解锁并保存，才能修改。</small>
  </fieldset>;
}
