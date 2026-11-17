import { serviceCall } from "../platform/bridge";

export const taskStatuses = ["待办", "进行中", "待查看", "已完成"];
export const taskPriorities = ["重要紧急", "重要不紧急", "紧急不重要", "不重要不紧急"];
export type WorkTask = {
  id:string;title:string;description:string;status:string;priority:string;project:string;date:string;endDate:string;parentId:string;
  revision?:number;kind?:"task"|"calendar_event";dueDate?:string;dueAt?:string;dueLocal?:string;timezone?:string;projectId?:string;
  blocks?:ScheduleBlock[];
  replyPending?:boolean;
};
export type ScheduleBlock={id:string;revision:number;startAt:string;endAt:string;localStart:string;localEnd:string;timezone:string;binding:"floating_local"|"zoned_local"|"absolute_instant";allDay:boolean;locked:boolean;estimateSource:string};
export type WorkNote = {
  id:string;title:string;content:string;parentId:string;updatedAt:string;
  folder?:boolean;favorite?:boolean;archived?:boolean;inbox?:boolean;tags?:string[];
};
export type Reminder = { id:string;itemId:string;revision:number;kind:"once"|"daily"|"weekly";local:string;timezone:string;enabled:boolean;catchUp:"within_grace"|"current_day_once"|"skip";next:string };
export type Delivery = { id:string;text:string;status:string;purpose:string;created:string;actions:{action_id:string;label:string;route:{type:string;item_id?:string;terminal_session_id?:string;session_id?:string;attention_id?:string;result_ref?:string;result_version?:number}}[] };
export type PlanChange={itemId:string;title:string;date:string;endDate:string;timezone:string;estimateMinutes:number;blocks?:ScheduleBlock[]};
export type PlanDraft={id:string;revision:number;state:string;sessionId:string;changes:PlanChange[];conflicts?:string[]};
export const workApi={
  details:(id:string)=>serviceCall<{workspace:string;updatedAt:string;executor:string;state:string;sessionId:string;terminalId:string}>("Work.Details",id),
  tasks:()=>serviceCall<WorkTask[]>("Work.Tasks"),
  saveTask:(task:WorkTask)=>serviceCall<WorkTask>("Work.SaveTask",{...task,timezone:task.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone}),
  deleteTask:(id:string)=>serviceCall<void>("Work.DeleteTask",id),
  notes:()=>serviceCall<WorkNote[]>("Work.Notes"),
  saveNote:(note:WorkNote)=>serviceCall<WorkNote>("Work.SaveNote",note),
  deleteNote:(id:string)=>serviceCall<void>("Work.DeleteNote",id),
  reminders:(item:string)=>serviceCall<Reminder[]>("Work.Reminders",item),
  saveReminder:(r:Reminder)=>serviceCall<Reminder>("Work.SaveReminder",r),
  notifications:()=>serviceCall<Delivery[]>("Work.Notifications"),
  respondNotification:(id:string,action:string,command:string)=>serviceCall<void>("Work.RespondNotification",id,action,command),
  plans:()=>serviceCall<PlanDraft[]>("Work.Plans"),
  updatePlan:(p:PlanDraft)=>serviceCall<PlanDraft>("Work.UpdatePlan",p),
  commitPlan:(p:PlanDraft)=>serviceCall<void>("Work.CommitPlan",p.id,p.revision),
  discardPlan:(p:PlanDraft)=>serviceCall<void>("Work.DiscardPlan",p.id,p.revision),
};
