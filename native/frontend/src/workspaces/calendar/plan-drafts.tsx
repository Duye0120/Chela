import { useRef, useState } from "react";
import { workApi, type PlanDraft, type WorkTask } from "../../data/work";
import { Button } from "../../ui/button";
import { Input } from "../../ui/text-field";
import { ScheduleBlockFields } from "../../ui/schedule-block-fields";

export function PlanDrafts({tasks,onCommitted}:{tasks:WorkTask[];onCommitted:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[plans,setPlans]=useState<PlanDraft[]>([]),[edit,setEdit]=useState<PlanDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function action(fn:()=>Promise<void>){setBusy(true);setError("");try{await fn()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  function open(){dialog.current?.showModal();void action(async()=>{setPlans(await workApi.plans());setEdit(null)})}
  return <><Button onClick={open}>计划草案</Button><dialog ref={dialog} className="notifications" aria-label="计划草案"><header><h2>计划草案</h2><Button onClick={()=>dialog.current?.close()}>关闭</Button></header>
    <p>在对话中说“帮我安排这周”，可在这里查看与修改草案。采用后只更新排期，不会自动执行任务。</p>
    {error&&<p role="alert">{error}</p>}{!plans.length&&<p>暂无待确认草案。</p>}
    {plans.map(plan=>{const current=edit?.id===plan.id?edit:plan;return <article key={plan.id}><h3>{plan.changes.length} 项安排 · 版本 {plan.revision}</h3>
      {current.changes.map((change,index)=><fieldset key={index}><legend>{change.itemId?tasks.find(t=>t.id===change.itemId)?.title||change.title||"已有事项":change.title} {change.estimateMinutes>0?`· 预计 ${change.estimateMinutes} 分钟`:""}</legend>
        {change.blocks?<ScheduleBlockFields plan blocks={change.blocks} timezone={change.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={blocks=>setEdit({...current,changes:current.changes.map((c,i)=>i===index?{...c,blocks}:c)})}/>:<>
        <label>排期开始<Input type="date" value={change.date} onChange={e=>setEdit({...current,changes:current.changes.map((c,i)=>i===index?{...c,date:e.target.value}:c)})}/></label>
        <label>排期结束<Input type="date" value={change.endDate||""} min={change.date} onChange={e=>setEdit({...current,changes:current.changes.map((c,i)=>i===index?{...c,endDate:e.target.value}:c)})}/></label><small>{change.timezone}</small>
        <Button onClick={()=>setEdit({...current,changes:current.changes.map((c,i)=>i===index?{...c,date:"",endDate:"",blocks:[]}:c)})}>改用多个时间块</Button></>}
      </fieldset>)}<div>
        {edit?.id===plan.id?<Button disabled={busy} onClick={()=>void action(async()=>{const saved=await workApi.updatePlan(edit);setPlans(plans.map(p=>p.id===saved.id?saved:p));setEdit(null)})}>保存草案修改</Button>:<Button variant="primary" disabled={busy||Boolean(plan.conflicts?.length)} onClick={()=>void action(async()=>{await workApi.commitPlan(plan);setPlans(await workApi.plans());onCommitted()})}>采用这个计划</Button>}
        {!edit&&<Button disabled={busy} onClick={()=>setEdit({...plan})}>检查并修改</Button>}
        <Button disabled={busy} onClick={()=>void action(async()=>{await workApi.discardPlan(plan);setPlans(await workApi.plans());setEdit(null)})}>放弃草案</Button>
      </div>{plan.conflicts?.map((conflict,i)=><p role="status" key={i}>{conflict}</p>)}</article>})}
  </dialog></>;
}
